import "server-only";
import type { PoolClient } from "pg";
import { z } from "zod";
import { asUser } from "./pg";

// ── What the browser may ask for ────────────────────────────────────────────
// Identifiers are never interpolated from user input without passing these
// whitelists; every value is a bound parameter. Authorization is enforced by
// Postgres row-level security because each request runs as the user.

const TABLES = new Set([
  "profiles",
  "user_preferences",
  "worlds",
  "world_members",
  "invitations",
  "activity",
  "messages",
  "message_reads",
  "media",
  "calls",
  "story_sessions",
  "memories",
  "calendar_events",
  "music_links",
  "game_sessions",
  "game_answers",
  "daily_entries",
  "daily_rewards",
  "decor_items",
  "world_rewards",
  "room_state",
  "city_visits",
  "love_notes",
]);

const PRIMARY_KEYS: Record<string, string[]> = {
  user_preferences: ["user_id"],
  message_reads: ["world_id", "user_id"],
  profiles: ["id"],
  city_visits: ["world_id", "user_id", "place_id"],
};

// jsonb columns: JS arrays bound to these must be sent as JSON, not as Postgres arrays.
const JSONB_COLUMNS = new Set(["avatar", "media_meta", "reactions", "history", "votes", "scores", "placed", "answer", "raw_user_meta_data"]);

type RpcShape = "row" | "scalar" | "rows";
export const RPCS: Record<string, RpcShape> = {
  toggle_reaction: "scalar",
  toggle_star: "scalar",
  update_call: "row",
  story_start: "row",
  story_vote: "row",
  story_advance: "row",
  story_reset: "row",
  story_set_mode: "row",
  sealed_capsules: "rows",
  game_start: "row",
  game_submit: "row",
  game_judge: "row",
  game_next: "row",
  submit_daily: "scalar",
  unlock_decor: "scalar",
  create_world: "scalar",
  create_invitation: "scalar",
  revoke_invitations: "scalar",
  invitation_preview: "scalar",
  accept_invitation: "scalar",
  check_in: "scalar",
  find_note: "scalar",
};

const ident = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/);
const filter = z.object({ col: ident, op: z.enum(["eq", "neq", "lt", "gt", "lte", "gte", "in", "is"]), value: z.unknown() });
const table = ident.refine((t) => TABLES.has(t), "unknown table");
const row = z.record(ident, z.unknown());

export const dbRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("select"),
    table,
    columns: z.string().max(500).default("*"),
    filters: z.array(filter).max(12).default([]),
    order: z.array(z.object({ col: ident, asc: z.boolean() })).max(3).default([]),
    limit: z.number().int().min(1).max(500).optional(),
    count: z.boolean().default(false),
    head: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("insert"), table, values: z.union([row, z.array(row).min(1).max(100)]), returning: z.boolean().default(false) }),
  z.object({ kind: z.literal("upsert"), table, values: z.union([row, z.array(row).min(1).max(100)]), returning: z.boolean().default(false) }),
  z.object({ kind: z.literal("update"), table, values: row, filters: z.array(filter).min(1).max(12), returning: z.boolean().default(false) }),
  z.object({ kind: z.literal("delete"), table, filters: z.array(filter).min(1).max(12), returning: z.boolean().default(false) }),
  z.object({ kind: z.literal("rpc"), fn: ident.refine((f) => f in RPCS, "unknown function"), args: z.record(z.string().regex(/^p_[a-z_]{1,40}$/), z.unknown()).default({}) }),
]);
export type DbRequest = z.infer<typeof dbRequest>;

export type DbResult = { data: unknown; count?: number | null; error: { message: string; code?: string } | null };

const q = (id: string) => `"${id}"`;
const bindValue = (col: string, v: unknown) => (JSONB_COLUMNS.has(col) && v !== null && v !== undefined ? JSON.stringify(v) : v);

function columnsSql(cols: string) {
  if (cols.trim() === "*") return "*";
  const list = cols.split(",").map((c) => c.trim());
  for (const c of list) if (!ident.safeParse(c).success) throw new BadRequest(`bad column ${c}`);
  return list.map(q).join(", ");
}

function whereSql(filters: z.infer<typeof filter>[], params: unknown[]) {
  if (!filters.length) return "";
  const parts = filters.map(({ col, op, value }) => {
    if (op === "is") {
      if (value !== null) throw new BadRequest("is() supports null only");
      return `${q(col)} is null`;
    }
    if (op === "in") {
      if (!Array.isArray(value) || value.length > 200) throw new BadRequest("in() needs an array");
      params.push(value);
      return `${q(col)} = any($${params.length})`;
    }
    params.push(bindValue(col, value));
    const sym = { eq: "=", neq: "<>", lt: "<", gt: ">", lte: "<=", gte: ">=" }[op];
    return `${q(col)} ${sym} $${params.length}`;
  });
  return ` where ${parts.join(" and ")}`;
}

function insertSql(tableName: string, values: Record<string, unknown> | Record<string, unknown>[], params: unknown[]) {
  const rows = Array.isArray(values) ? values : [values];
  const cols = Object.keys(rows[0]);
  if (!cols.length) throw new BadRequest("empty insert");
  const tuples = rows.map((r) => {
    if (Object.keys(r).length !== cols.length || !cols.every((c) => c in r)) throw new BadRequest("rows must share columns");
    return `(${cols.map((c) => (params.push(bindValue(c, r[c])), `$${params.length}`)).join(", ")})`;
  });
  return { sql: `insert into public.${q(tableName)} (${cols.map(q).join(", ")}) values ${tuples.join(", ")}`, cols };
}

class BadRequest extends Error {}

export async function runDb(userId: string, req: DbRequest): Promise<DbResult> {
  try {
    return await asUser(userId, (c) => execute(c, req));
  } catch (e) {
    return { data: null, error: toClientError(e) };
  }
}

async function execute(c: PoolClient, req: DbRequest): Promise<DbResult> {
  const params: unknown[] = [];
  switch (req.kind) {
    case "select": {
      const where = whereSql(req.filters, params);
      if (req.head) {
        const { rows } = await c.query(`select count(*)::int as n from public.${q(req.table)}${where}`, params);
        return { data: null, count: rows[0].n, error: null };
      }
      const order = req.order.length ? ` order by ${req.order.map((o) => `${q(o.col)} ${o.asc ? "asc" : "desc"}`).join(", ")}` : "";
      const limit = req.limit ? ` limit ${req.limit}` : "";
      const { rows } = await c.query(`select ${columnsSql(req.columns)} from public.${q(req.table)}${where}${order}${limit}`, params);
      let count: number | null = null;
      if (req.count) count = (await c.query(`select count(*)::int as n from public.${q(req.table)}${where}`, params)).rows[0].n;
      return { data: rows, count, error: null };
    }
    case "insert": {
      const { sql } = insertSql(req.table, req.values, params);
      const { rows } = await c.query(sql + (req.returning ? " returning *" : ""), params);
      return { data: req.returning ? rows : null, error: null };
    }
    case "upsert": {
      const pk = PRIMARY_KEYS[req.table];
      if (!pk) throw new BadRequest("upsert not supported for this table");
      const { sql, cols } = insertSql(req.table, req.values, params);
      const updates = cols.filter((c2) => !pk.includes(c2));
      const conflict = updates.length ? `do update set ${updates.map((c2) => `${q(c2)} = excluded.${q(c2)}`).join(", ")}` : "do nothing";
      const { rows } = await c.query(`${sql} on conflict (${pk.map(q).join(", ")}) ${conflict}${req.returning ? " returning *" : ""}`, params);
      return { data: req.returning ? rows : null, error: null };
    }
    case "update": {
      const cols = Object.keys(req.values);
      if (!cols.length) throw new BadRequest("empty update");
      const set = cols.map((col) => (params.push(bindValue(col, req.values[col])), `${q(col)} = $${params.length}`)).join(", ");
      const where = whereSql(req.filters, params);
      const { rows } = await c.query(`update public.${q(req.table)} set ${set}${where}${req.returning ? " returning *" : ""}`, params);
      return { data: req.returning ? rows : null, error: null };
    }
    case "delete": {
      const where = whereSql(req.filters, params);
      const { rows } = await c.query(`delete from public.${q(req.table)}${where}${req.returning ? " returning *" : ""}`, params);
      return { data: req.returning ? rows : null, error: null };
    }
    case "rpc": {
      const names = Object.keys(req.args);
      const args = names.map((n, i) => (params.push(bindValue(n.replace(/^p_/, ""), req.args[n])), `${q(n)} => $${i + 1}`)).join(", ");
      const shape = RPCS[req.fn];
      if (shape === "scalar") {
        const { rows } = await c.query(`select public.${q(req.fn)}(${args}) as result`, params);
        return { data: rows[0]?.result ?? null, error: null };
      }
      const { rows } = await c.query(`select * from public.${q(req.fn)}(${args})`, params);
      return { data: shape === "rows" ? rows : rows[0] ?? null, error: null };
    }
  }
}

/** Only expose messages that are safe and useful; hide internal details. */
function toClientError(e: unknown): { message: string; code?: string } {
  if (e instanceof BadRequest) return { message: e.message, code: "BAD_REQUEST" };
  const err = e as { code?: string; message?: string };
  switch (err.code) {
    case "P0001": // raise exception in our functions — written to be user-facing
      return { message: err.message ?? "Not allowed", code: err.code };
    case "42501":
      return { message: "You don't have access to that.", code: err.code };
    case "23505":
      return { message: "That already exists.", code: err.code };
    case "23514":
    case "22001":
      return { message: "That's too long or not allowed.", code: err.code };
    case "22P02":
      return { message: "Invalid value.", code: err.code };
    default:
      console.error("[db] query failed:", err.code ?? "", (err.message ?? "").slice(0, 200));
      return { message: "Something went wrong saving that. Please try again.", code: err.code };
  }
}

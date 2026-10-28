// Applies the real migration to a throwaway local Postgres database and checks
// the privacy guarantees as three different signed-in users.
// Run with: npm run test:db   (needs a local Postgres; set PGHOST/PGUSER if not default)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbName = `justus_test_${Date.now()}`;
const admin = new Client({ database: process.env.PGDATABASE ?? "postgres" });
let db: Client;

const users = {
  ada: "11111111-1111-4111-8111-111111111111",
  tobi: "22222222-2222-4222-8222-222222222222",
  intruder: "33333333-3333-4333-8333-333333333333",
};

/** Runs `sql` as the given user exactly as PostgREST would (role + JWT sub). */
async function as<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const res = await db.query(sql, params);
    await db.query("commit");
    return res.rows as T[];
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

beforeAll(async () => {
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  db = new Client({ database: dbName });
  await db.connect();
  const dir = join(__dirname, "..", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.query(readFileSync(join(dir, f), "utf8"));
  for (const [name, id] of Object.entries(users)) {
    await db.query("insert into auth.users (id, email, password_hash, raw_user_meta_data) values ($1, $2, 'x', $3)", [
      id,
      `${name}@example.test`,
      { display_name: name },
    ]);
  }
  process.env.DATABASE_URL = `postgres://${process.env.PGHOST ?? "localhost"}/${dbName}`;
}, 30_000);

afterAll(async () => {
  const { pool } = await import("@/lib/server/pg");
  await pool().end();
  await db?.end();
  await admin.query(`drop database if exists ${dbName}`);
  await admin.end();
});

describe("private world access", () => {
  let worldId = "";
  let token = "";

  it("creates profiles automatically and lets the creator found a world", async () => {
    const [p] = await as(users.ada, "select display_name from profiles where id = $1", [users.ada]);
    expect(p.display_name).toBe("ada");
    const [w] = await as<{ id: string }>(users.ada, "select create_world('Ada & Tobi', '2024-02-14') as id");
    worldId = w.id;
    expect(worldId).toMatch(/[0-9a-f-]{36}/);
  });

  it("refuses a second world for the same account", async () => {
    await expect(as(users.ada, "select create_world('again', null)")).rejects.toThrow(/already in a world/);
  });

  it("only the creator can mint invites, and only hashes are stored", async () => {
    const [r] = await as<{ t: string }>(users.ada, "select create_invitation() as t");
    token = r.t;
    expect(token).toHaveLength(48);
    const rows = await db.query("select token_hash from invitations");
    expect(rows.rows.every((x) => x.token_hash !== token)).toBe(true);
    await expect(as(users.intruder, "select create_invitation()")).rejects.toThrow(/only the creator/);
  });

  it("an outsider cannot see the world or its messages before joining", async () => {
    await as(users.ada, "insert into messages (world_id, sender_id, client_id, body) values ($1, $2, gen_random_uuid(), 'hi love')", [
      worldId,
      users.ada,
    ]);
    expect(await as(users.intruder, "select * from worlds")).toHaveLength(0);
    expect(await as(users.intruder, "select * from messages")).toHaveLength(0);
    expect(await as(users.intruder, "select * from profiles where id = $1", [users.ada])).toHaveLength(0);
  });

  it("the partner joins with the token; membership cannot be self-inserted", async () => {
    await expect(
      as(users.intruder, "insert into world_members (world_id, user_id, role) values ($1, $2, 'partner')", [worldId, users.intruder]),
    ).rejects.toThrow();
    const [preview] = await as<{ p: { valid: boolean; world: string } }>(users.tobi, "select invitation_preview($1) as p", [token]);
    expect(preview.p).toMatchObject({ valid: true, world: "Ada & Tobi" });
    const [j] = await as<{ w: string }>(users.tobi, "select accept_invitation($1) as w", [token]);
    expect(j.w).toBe(worldId);
    expect(await as(users.tobi, "select * from messages")).toHaveLength(1);
  });

  it("a third account can never join — reused token, or a fresh invite", async () => {
    await expect(as(users.intruder, "select accept_invitation($1)", [token])).rejects.toThrow(/invalid or expired/);
    await expect(as(users.ada, "select create_invitation()")).rejects.toThrow(/world is full/);
    // Even a direct insert by a superuser path is blocked by the cap trigger.
    await expect(
      db.query("insert into world_members (world_id, user_id, role) values ($1, $2, 'partner')", [worldId, users.intruder]),
    ).rejects.toThrow(/world is full/);
    expect(await as(users.intruder, "select * from messages")).toHaveLength(0);
  });

  it("messages cannot be forged as the partner or into another world", async () => {
    await expect(
      as(users.tobi, "insert into messages (world_id, sender_id, client_id, body) values ($1, $2, gen_random_uuid(), 'x')", [
        worldId,
        users.ada,
      ]),
    ).rejects.toThrow(/row-level security/);
  });

  it("clients cannot grant themselves points", async () => {
    await expect(as(users.ada, "update worlds set points = 9999 where id = $1", [worldId])).rejects.toThrow(/permission denied/);
    await as(users.ada, "update worlds set name = 'Us' where id = $1", [worldId]);
  });

  it("reactions toggle atomically", async () => {
    const [m] = await as<{ id: string }>(users.tobi, "select id from messages limit 1");
    await as(users.tobi, "select toggle_reaction($1, '❤️')", [m.id]);
    const [r] = await as<{ r: Record<string, string[]> }>(users.ada, "select toggle_reaction($1, '❤️') as r", [m.id]);
    expect(r.r["❤️"].sort()).toEqual([users.ada, users.tobi].sort());
    await expect(as(users.intruder, "select toggle_reaction($1, '❤️')", [m.id])).rejects.toThrow(/not allowed/);
  });

  it("game answers stay hidden until you answer, rewards are granted once", async () => {
    const [g] = await as<{ id: string }>(users.ada, "select (game_start('wyr', 'w1')).id as id");
    await as(users.ada, "select game_submit($1, 1, '{\"choice\":0}')", [g.id]);
    await as(users.ada, "select game_submit($1, 1, '{\"choice\":1}')", [g.id]); // duplicate tap is ignored
    expect(await as(users.tobi, "select * from game_answers")).toHaveLength(0);
    const [after] = await as<{ s: string }>(users.tobi, "select (game_submit($1, 1, '{\"choice\":0}')).state as s", [g.id]);
    expect(after.s).toBe("revealed");
    expect(await as(users.tobi, "select * from game_answers")).toHaveLength(2);
    const [w] = await as<{ points: number }>(users.ada, "select points from worlds");
    expect(w.points).toBe(2);
    // Two "next" presses on the same round advance once.
    await as(users.ada, "select game_next($1, 1, 'w2')", [g.id]);
    await as(users.tobi, "select game_next($1, 1, 'w3')", [g.id]);
    const [s] = await as<{ round: number; prompt_id: string }>(users.ada, "select round, prompt_id from game_sessions");
    expect(s).toMatchObject({ round: 2, prompt_id: "w2" });
  });

  it("the daily quest pays out exactly once", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await as(users.ada, "select submit_daily('quest', $1, 'done')", [day]);
    const [r1] = await as<{ r: { rewarded: boolean } }>(users.tobi, "select submit_daily('quest', $1, 'done') as r", [day]);
    const [r2] = await as<{ r: { rewarded: boolean } }>(users.tobi, "select submit_daily('quest', $1, 'again') as r", [day]);
    expect(r1.r.rewarded).toBe(true);
    expect(r2.r.rewarded).toBe(false);
    const [w] = await as<{ points: number }>(users.ada, "select points from worlds");
    expect(w.points).toBe(12);
  });

  it("decor costs points and placing locked decor is rejected", async () => {
    const [u] = await as<{ r: { ok: boolean; points: number } }>(users.ada, "select unlock_decor('books') as r");
    expect(u.r).toEqual({ ok: true, points: 2 });
    const [no] = await as<{ r: { ok: boolean } }>(users.ada, "select unlock_decor('telescope') as r");
    expect(no.r.ok).toBe(false);
    await expect(
      as(users.tobi, `update room_state set placed = '[{"slot":0,"item":"telescope"}]', updated_by = $1`, [users.tobi]),
    ).rejects.toThrow(/not unlocked/);
    await as(users.tobi, `update room_state set placed = '[{"slot":0,"item":"books"}]', updated_by = $1`, [users.tobi]);
  });

  it("time capsules stay sealed for the partner until their date", async () => {
    await as(users.ada, "insert into memories (world_id, author_id, kind, title, body, unlock_at) values ($1, $2, 'capsule', 'For our 5th', 'secret', now() + interval '1 year')", [
      worldId,
      users.ada,
    ]);
    expect(await as(users.tobi, "select body from memories where kind = 'capsule'")).toHaveLength(0);
    const sealed = await as<{ title: string }>(users.tobi, "select title from sealed_capsules()");
    expect(sealed.map((s) => s.title)).toEqual(["For our 5th"]);
    expect(await as(users.ada, "select body from memories where kind = 'capsule'")).toHaveLength(1);
    await expect(as(users.tobi, "delete from memories where kind = 'capsule' returning id")).resolves.toHaveLength(0);
  });

  it("call status cannot be revived after it ends", async () => {
    const [c] = await as<{ id: string }>(users.ada, "insert into calls (world_id, caller_id, callee_id, kind) values ($1, $2, $3, 'video') returning id", [
      worldId,
      users.ada,
      users.tobi,
    ]);
    const [missed] = await as<{ s: string }>(users.ada, "select (update_call($1, 'ended')).status as s", [c.id]);
    expect(missed.s).toBe("missed");
    const [still] = await as<{ s: string }>(users.tobi, "select (update_call($1, 'active')).status as s", [c.id]);
    expect(still.s).toBe("missed");
  });

  it("story advances once when both partners resolve the same vote", async () => {
    const [s] = await as<{ id: string }>(users.ada, "select (story_start('city', 'start')).id as id");
    await as(users.ada, "select story_vote($1, 'start', 0)", [s.id]);
    await as(users.tobi, "select story_vote($1, 'start', 0)", [s.id]);
    await as(users.ada, "select story_advance($1, 'start', 'n2', 0)", [s.id]);
    await as(users.tobi, "select story_advance($1, 'start', 'n2', 0)", [s.id]);
    const [row] = await as<{ node_id: string; n: number }>(users.ada, "select node_id, jsonb_array_length(history) as n from story_sessions");
    expect(row).toEqual({ node_id: "n2", n: 1 });
  });
});

describe("data API (/api/db translator)", () => {
  const api = () => import("@/lib/server/db-api");

  it("runs queries as the user, under RLS", async () => {
    const { runDb } = await api();
    const mine = await runDb(users.ada, { kind: "select", table: "messages", columns: "*", filters: [], order: [], count: false, head: false });
    expect((mine.data as unknown[]).length).toBeGreaterThan(0);
    const theirs = await runDb(users.intruder, { kind: "select", table: "messages", columns: "*", filters: [], order: [], count: false, head: false });
    expect(theirs.data).toEqual([]);
  });

  it("rejects unknown tables, functions and injected identifiers", async () => {
    const { dbRequest, runDb } = await api();
    expect(dbRequest.safeParse({ kind: "select", table: "messages; drop table messages" }).success).toBe(false);
    expect(dbRequest.safeParse({ kind: "select", table: "users" }).success).toBe(false);
    expect(dbRequest.safeParse({ kind: "rpc", fn: "add_points", args: {} }).success).toBe(false);
    expect(dbRequest.safeParse({ kind: "select", table: "messages", filters: [{ col: "id = id or 1", op: "eq", value: 1 }] }).success).toBe(false);
    expect(dbRequest.safeParse({ kind: "update", table: "messages", values: { body: "x" }, filters: [] }).success).toBe(false);
    const bad = await runDb(users.ada, { kind: "select", table: "messages", columns: "id, (select password_hash from auth.users)", filters: [], order: [], count: false, head: false });
    expect(bad.error?.code).toBe("BAD_REQUEST");
  });

  it("values are bound, never interpolated", async () => {
    const { runDb } = await api();
    const r = await runDb(users.ada, { kind: "select", table: "messages", columns: "id", filters: [{ col: "body", op: "eq", value: "x' or '1'='1" }], order: [], count: false, head: false });
    expect(r.data).toEqual([]);
  });

  it("the app role can never read passwords or sessions", async () => {
    await expect(as(users.ada, "select password_hash from auth.users")).rejects.toThrow(/permission denied/);
    await expect(as(users.ada, "select * from auth.sessions")).rejects.toThrow(/permission denied/);
  });

  it("RPCs return rows and scalars in the expected shape; DB errors stay friendly", async () => {
    const { runDb } = await api();
    const row = await runDb(users.ada, { kind: "rpc", fn: "story_start", args: { p_story: "perfect-day", p_start: "start" } });
    expect((row.data as { node_id: string }).node_id).toBe("start");
    const full = await runDb(users.ada, { kind: "rpc", fn: "create_invitation", args: {} });
    expect(full.error?.message).toMatch(/world is full/);
  });

  it("upserts read receipts and keeps jsonb arrays as JSON", async () => {
    const { runDb } = await api();
    const [w] = await as<{ id: string }>(users.ada, "select id from worlds");
    const up = await runDb(users.ada, { kind: "upsert", table: "message_reads", values: { world_id: w.id, user_id: users.ada, last_read_at: new Date().toISOString() }, returning: true });
    expect(up.error).toBeNull();
    await runDb(users.ada, { kind: "rpc", fn: "unlock_decor", args: { p_item: "plant" } });
    const placed = await runDb(users.tobi, { kind: "update", table: "room_state", values: { placed: [{ slot: 1, item: "plant" }], updated_by: users.tobi }, filters: [{ col: "world_id", op: "eq", value: w.id }], returning: true });
    expect(placed.error).toBeNull();
    expect((placed.data as { placed: unknown }[])[0].placed).toEqual([{ slot: 1, item: "plant" }]);
  });
});

describe("realtime change feed", () => {
  it("publishes inserts with the world id", async () => {
    const listener = new Client({ database: dbName });
    await listener.connect();
    await listener.query("listen justus_changes");
    const got = new Promise<{ table: string; op: string; world: string; row: { body: string } }>((resolve) =>
      listener.on("notification", (n) => resolve(JSON.parse(n.payload!))),
    );
    const [w] = await as<{ id: string }>(users.ada, "select id from worlds");
    await as(users.tobi, "insert into messages (world_id, sender_id, client_id, body) values ($1, $2, gen_random_uuid(), 'live!')", [w.id, users.tobi]);
    const evt = await got;
    expect(evt).toMatchObject({ table: "messages", op: "INSERT", world: w.id });
    expect(evt.row.body).toBe("live!");
    await listener.end();
  });
});

"use client";
// Browser data client. Builds a JSON description of a query and sends it to
// /api/db, where it is validated, turned into parameterized SQL and run as the
// signed-in user under Postgres row-level security.

export type DbError = { message: string; code?: string };
export type DbResponse<T> = { data: T; error: DbError | null; count?: number | null };

type Filter = { col: string; op: "eq" | "neq" | "lt" | "gt" | "lte" | "gte" | "in" | "is"; value: unknown };
type Kind = "select" | "insert" | "update" | "delete" | "upsert";
// Untyped rows, like an untyped Supabase client: pages cast to the row types in lib/types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

async function post<T>(url: string, payload: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
  } catch {
    throw Object.assign(new Error("You seem to be offline. Check your connection and try again."), { code: "NETWORK" });
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("justus:signed-out"));
  if (!res.ok) throw Object.assign(new Error(body?.error?.message ?? `Request failed (${res.status})`), { code: String(res.status) });
  return body as T;
}

class Query<T = AnyRow[]> implements PromiseLike<DbResponse<T>> {
  private kind: Kind = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private max?: number;
  private wantCount = false;
  private head = false;
  private values?: unknown;
  private returning = false;
  private one: "single" | "maybe" | null = null;

  constructor(private table: string) {}

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.kind === "select") {
      this.columns = columns;
      this.wantCount = opts?.count === "exact";
      this.head = Boolean(opts?.head);
    } else this.returning = true;
    return this;
  }
  insert(values: unknown) {
    this.kind = "insert";
    this.values = values;
    return this;
  }
  upsert(values: unknown) {
    this.kind = "upsert";
    this.values = values;
    return this;
  }
  update(values: unknown) {
    this.kind = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.kind = "delete";
    return this;
  }
  private f(col: string, op: Filter["op"], value: unknown) {
    this.filters.push({ col, op, value });
    return this;
  }
  eq(col: string, v: unknown) {
    return this.f(col, "eq", v);
  }
  neq(col: string, v: unknown) {
    return this.f(col, "neq", v);
  }
  lt(col: string, v: unknown) {
    return this.f(col, "lt", v);
  }
  gt(col: string, v: unknown) {
    return this.f(col, "gt", v);
  }
  lte(col: string, v: unknown) {
    return this.f(col, "lte", v);
  }
  gte(col: string, v: unknown) {
    return this.f(col, "gte", v);
  }
  in(col: string, v: unknown[]) {
    return this.f(col, "in", v);
  }
  is(col: string, v: null) {
    return this.f(col, "is", v);
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single<R = T extends (infer U)[] ? U : T>() {
    this.one = "single";
    return this as unknown as Query<R>;
  }
  maybeSingle<R = T extends (infer U)[] ? U : T>() {
    this.one = "maybe";
    return this as unknown as Query<R | null>;
  }

  private async run(): Promise<DbResponse<T>> {
    const req =
      this.kind === "select"
        ? { kind: "select", table: this.table, columns: this.columns, filters: this.filters, order: this.orders, limit: this.max, count: this.wantCount, head: this.head }
        : { kind: this.kind, table: this.table, values: this.values, filters: this.filters.length ? this.filters : undefined, returning: this.returning || this.one !== null };
    try {
      const res = await post<DbResponse<unknown>>("/api/db", req);
      if (res.error) return { data: null as T, error: res.error, count: null };
      let data = res.data;
      if (this.one && Array.isArray(data)) {
        if (data.length > 1 || (this.one === "single" && data.length === 0)) return { data: null as T, error: { message: "Expected exactly one row", code: "PGRST116" } };
        data = data[0] ?? null;
      }
      return { data: data as T, error: null, count: res.count ?? null };
    } catch (e) {
      const err = e as { message: string; code?: string };
      return { data: null as T, error: { message: err.message, code: err.code }, count: null };
    }
  }

  then<A = DbResponse<T>, B = never>(ok?: ((v: DbResponse<T>) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, bad);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<DbResponse<T>> {
  try {
    const res = await post<DbResponse<T>>("/api/db", { kind: "rpc", fn, args });
    return { data: res.data, error: res.error ?? null };
  } catch (e) {
    const err = e as { message: string; code?: string };
    return { data: null as T, error: { message: err.message, code: err.code } };
  }
}

const client = {
  from: <T = AnyRow[]>(table: string) => new Query<T>(table),
  rpc,
};

export function db() {
  return client;
}

// ── media ──
export async function signMediaUrls(paths: string[]) {
  const res = await post<{ urls: { path: string; url: string }[] }>("/api/media/sign", { paths });
  return res.urls;
}

export async function deleteMedia(paths: string[]) {
  if (!paths.length) return;
  await post("/api/media/delete", { paths }).catch(() => {});
}

export async function requestUpload(worldId: string, mime: string, size: number) {
  return post<{ path: string; url: string; headers: Record<string, string> }>("/api/media/upload", { worldId, mime, size });
}

export async function completeUpload(p: { path: string; kind: "image" | "video" | "voice"; width?: number; height?: number; duration_ms?: number }) {
  return post<{ path: string }>("/api/media/complete", p);
}

// ── auth ──
export const auth = {
  signIn: (email: string, password: string) => post<{ ok: true }>("/api/auth/login", { email, password }),
  signUp: (email: string, password: string, display_name: string) => post<{ ok: true }>("/api/auth/signup", { email, password, display_name }),
  signOut: () => post<{ ok: true }>("/api/auth/logout", {}),
  changePassword: (current: string, next: string) => post<{ ok: true }>("/api/auth/password", { current, next }),
};

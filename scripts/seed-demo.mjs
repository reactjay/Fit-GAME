// Creates demo accounts for trying JustUs locally. DEVELOPMENT ONLY — refuses to run in production.
//   npm run seed:demo
// Accounts (all share the demo password below):
//   ada@justus.test       creator of "Ada & Tobi's Corner"
//   tobi@justus.test      partner, already moved in
//   outsider@justus.test  has no world — use it to confirm a third person can't get in
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd(), true);
if (process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT) {
  console.error("Refusing to seed demo accounts in production.");
  process.exit(1);
}
export const DEMO_PASSWORD = "justus-demo-2026";
const scrypt = promisify(scryptCb);
async function hash(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const as = async (userId, sql, params = []) => {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const r = await client.query(sql, params);
    await client.query("commit");
    return r.rows;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
};

try {
  const exists = await client.query("select 1 from auth.users where lower(email) = 'ada@justus.test'");
  if (exists.rowCount) {
    console.log("Demo accounts already exist. Password:", DEMO_PASSWORD);
    process.exit(0);
  }
  const ids = {};
  for (const [key, name] of [["ada", "Ada"], ["tobi", "Tobi"], ["outsider", "Stranger"]]) {
    const { rows } = await client.query("insert into auth.users (email, password_hash, raw_user_meta_data) values ($1, $2, $3) returning id", [
      `${key}@justus.test`,
      await hash(DEMO_PASSWORD),
      { display_name: name },
    ]);
    ids[key] = rows[0].id;
  }
  await client.query("update public.profiles set avatar = $2 where id = $1", [ids.ada, { skin: 3, hair: 2, hairColor: 0, outfit: 0, accessory: 3 }]);
  await client.query("update public.profiles set avatar = $2 where id = $1", [ids.tobi, { skin: 4, hair: 5, hairColor: 0, outfit: 1, accessory: 4 }]);

  const [{ w }] = await as(ids.ada, "select public.create_world('Ada & Tobi''s Corner', '2024-02-14') as w");
  const [{ t }] = await as(ids.ada, "select public.create_invitation() as t");
  await as(ids.tobi, "select public.accept_invitation($1)", [t]);

  const say = (who, body, minsAgo) =>
    client.query("insert into public.messages (world_id, sender_id, client_id, body, created_at) values ($1, $2, gen_random_uuid(), $3, now() - make_interval(mins => $4))", [w, ids[who], body, minsAgo]);
  await say("ada", "Good morning, sunshine ☀️", 180);
  await say("tobi", "Morning! Traffic on Third Mainland is crazy today 😩", 175);
  await say("ada", "Suya at Mama Nkechi's tonight?", 170);
  await say("tobi", "You read my mind 🍢💞", 168);

  await as(ids.ada, "insert into public.memories (world_id, author_id, kind, title, body, occurred_on) values ($1, $2, 'milestone', 'Our first date', 'Freedom Park, highlife band, and you stepped on my foot twice.', '2024-02-14')", [w, ids.ada]);
  await as(ids.tobi, "insert into public.memories (world_id, author_id, kind, title, body, mood) values ($1, $2, 'open_when', 'For the hard days', 'You are braver than you think, and I am always on your side.', 'you''re sad')", [w, ids.tobi]);
  await as(ids.ada, "insert into public.calendar_events (world_id, author_id, title, event_date, yearly, emoji) values ($1, $2, 'Tobi''s birthday', '1998-11-20', true, '🎂')", [w, ids.ada]);
  await client.query("update public.worlds set points = 60 where id = $1", [w]);

  console.log("Demo world created.");
  console.log("  ada@justus.test / tobi@justus.test / outsider@justus.test");
  console.log("  password:", DEMO_PASSWORD);
} finally {
  await client.end();
}

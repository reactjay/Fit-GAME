import "server-only";
import { AwsClient } from "aws4fetch";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pool } from "./pg";

// Private media storage. Production: Cloudflare R2 (S3-compatible), with the
// browser uploading/downloading directly through short-lived signed URLs.
// Development: files on local disk, served only to members of the world.

export const MAX_BYTES = 50 * 1024 * 1024;
export const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/x-m4a",
]);
const PATH_RE = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm|mov|ogg|m4a|mp3|aac|bin)$/;

export function worldOfPath(path: string) {
  return PATH_RE.exec(path)?.[1] ?? null;
}

export async function isMember(userId: string, worldId: string) {
  const { rowCount } = await pool().query("select 1 from public.world_members where user_id = $1 and world_id = $2", [userId, worldId]);
  return Boolean(rowCount);
}

const r2 = (() => {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    client: new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" }),
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
  };
})();

export const storageDriver = r2 ? "r2" : "local";
const localRoot = resolve(/*turbopackIgnore: true*/ process.env.LOCAL_UPLOAD_DIR ?? join(process.cwd(), ".data", "uploads"));
const localFile = (path: string) => join(/*turbopackIgnore: true*/ localRoot, path);

/** Where the browser should PUT the file. */
export async function uploadTarget(path: string, contentType: string) {
  if (!r2) return { url: `/api/media/object/${path}`, headers: { "Content-Type": contentType } };
  const signed = await r2.client.sign(`${r2.base}/${path}?X-Amz-Expires=600`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    aws: { signQuery: true, allHeaders: true },
  });
  return { url: signed.url, headers: { "Content-Type": contentType } };
}

/** Short-lived read URLs. */
export async function readUrls(paths: string[], ttlSeconds = 3600) {
  if (!r2) return paths.map((p) => `/api/media/object/${p}`);
  return Promise.all(
    paths.map(async (p) => (await r2.client.sign(`${r2.base}/${p}?X-Amz-Expires=${ttlSeconds}`, { method: "GET", aws: { signQuery: true } })).url),
  );
}

export async function headObject(path: string): Promise<{ size: number; type: string } | null> {
  if (!r2) {
    try {
      const s = await stat(/*turbopackIgnore: true*/ localFile(path));
      const type = (await readFile(/*turbopackIgnore: true*/ localFile(path) + ".type", "utf8").catch(() => "application/octet-stream")).trim();
      return { size: s.size, type };
    } catch {
      return null;
    }
  }
  const res = await r2.client.fetch(`${r2.base}/${path}`, { method: "HEAD" });
  if (!res.ok) return null;
  return { size: Number(res.headers.get("content-length") ?? 0), type: (res.headers.get("content-type") ?? "").split(";")[0] };
}

export async function deleteObjects(paths: string[]) {
  await Promise.all(
    paths.map(async (p) => {
      if (!r2) {
        await rm(localFile(p), { force: true });
        await rm(localFile(p) + ".type", { force: true });
      } else {
        await r2.client.fetch(`${r2.base}/${p}`, { method: "DELETE" });
      }
    }),
  );
}

// Local driver only
export async function writeLocal(path: string, body: Buffer, type: string) {
  await mkdir(dirname(localFile(path)), { recursive: true });
  await writeFile(localFile(path), body);
  await writeFile(localFile(path) + ".type", type);
}

export async function readLocal(path: string) {
  try {
    const [body, type] = await Promise.all([
      readFile(/*turbopackIgnore: true*/ localFile(path)),
      readFile(/*turbopackIgnore: true*/ localFile(path) + ".type", "utf8"),
    ]);
    return { body, type: type.trim() };
  } catch {
    return null;
  }
}

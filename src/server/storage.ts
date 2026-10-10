import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

// Cloudflare R2 through its S3-compatible API. The bucket is private.

let cached: S3Client | null = null;

export const storageConfigured = () =>
  Boolean(env.R2_ACCOUNT_ID && env.R2_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_ACCESS_KEY_SECRET);

function client() {
  if (!storageConfigured()) throw new Error("File storage (R2) is not configured");
  cached ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_ACCESS_KEY_SECRET! },
  });
  return cached;
}

/**
 * Evidence is private to its owner, so the bucket stays private: rows store `r2:<key>` and a
 * short-lived signed link is made whenever someone is allowed to view the file.
 */
export const storageRef = (key: string) => `r2:${key}`;
export const keyFromRef = (ref: string) => (ref.startsWith("r2:") ? ref.slice(3) : null);

/** Upload a file; returns its key and the reference to store on the Evidence row. */
export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "private, max-age=31536000, immutable",
    }),
  );
  return { key, ref: storageRef(key) };
}

/** A link that works for `expiresInSeconds` (default 10 minutes). */
export async function signedUrl(key: string, expiresInSeconds = 600) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }), { expiresIn: expiresInSeconds });
}

export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
}

import "server-only";
import { cookies } from "next/headers";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const origin = () => {
  const value = process.env.APP_URL;
  if (!value) throw new AppError("管理者が APP_URL を設定してください。", 503);
  return new URL(value).origin;
};
function key() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32)
    throw new AppError(
      "管理者が32文字以上の SESSION_SECRET を設定してください。",
      503,
    );
  return createHash("sha256").update(value).digest();
}
export function seal(data: unknown) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  return Buffer.concat([
    iv,
    c.update(JSON.stringify(data)),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64url");
}
export function unseal(value: string) {
  try {
    const b = Buffer.from(value, "base64url");
    const c = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    c.setAuthTag(b.subarray(-16));
    return JSON.parse(
      Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString(),
    );
  } catch {
    throw new AppError(
      "認証の有効期限が切れています。Google に再接続してください。",
      401,
    );
  }
}
export const cookieOptions = () => ({
  httpOnly: true,
  secure: origin().startsWith("https:"),
  sameSite: "lax" as const,
  path: "/",
});
const SessionSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number(),
  sessionUntil: z.number(),
});
export type Session = z.infer<typeof SessionSchema>;
export function checkAllowed(email: string) {
  const allowed = (process.env.APP_ALLOWED_EMAILS || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length)
    throw new AppError(
      "管理者が APP_ALLOWED_EMAILS に利用を許可するメールアドレスを設定してください。",
      503,
    );
  if (!allowed.includes(email.toLowerCase()))
    throw new AppError("このアカウントにはアプリの利用権限がありません。", 403);
}
export async function session(): Promise<Session> {
  const value = (await cookies()).get("afa-session")?.value;
  if (!value)
    throw new AppError("Google に接続してから操作してください。", 401);
  const s = SessionSchema.parse(unseal(value));
  if (s.sessionUntil < Date.now())
    throw new AppError("認証期限が切れました。再接続してください。", 401);
  checkAllowed(s.email);
  return s;
}
export async function token(s: Session) {
  if (s.expiresAt > Date.now() + 60000) return s.accessToken;
  if (!s.refreshToken)
    throw new AppError(
      "Google の接続期限が切れました。再接続してください。",
      401,
    );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: s.refreshToken,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok)
    throw new AppError(
      "Google の再認証が必要です。設定から再接続してください。",
      401,
    );
  const r = await res.json();
  s.accessToken = r.access_token;
  s.expiresAt = Date.now() + r.expires_in * 1000;
  (await cookies()).set("afa-session", seal(s), {
    ...cookieOptions(),
    maxAge: 60 * 60 * 24 * 7,
  });
  return s.accessToken;
}
const buckets = new Map<string, { used: number; reset: number }>();
export function limit(id: string, heavy = false) {
  const k = id + (heavy ? ":ai" : ":api"),
    t = Date.now(),
    b = buckets.get(k);
  if (b && b.reset > t) {
    if (b.used >= (heavy ? 12 : 90))
      throw new AppError(
        "短時間の利用回数が上限に達しました。1分ほど待ってください。",
        429,
      );
    b.used++;
  } else buckets.set(k, { used: 1, reset: t + 60000 });
  if (buckets.size > 10000)
    for (const [key, bucket] of buckets)
      if (bucket.reset < t) buckets.delete(key);
}
export async function guard(req: Request, heavy = false) {
  if (req.method !== "GET" && req.headers.get("origin") !== origin())
    throw new AppError("別サイトからの操作は許可されていません。", 403);
  const s = await session();
  limit(s.sub, heavy);
  return s;
}
export async function body(req: Request, maxBytes = 3_000_000) {
  const bytes = await rawBody(req, maxBytes);
  try {
    return JSON.parse(bytes.toString());
  } catch {
    throw new AppError("入力データの形式を確認してください。");
  }
}
export async function rawBody(req: Request, maxBytes: number) {
  if (Number(req.headers.get("content-length")) > maxBytes)
    throw new AppError(
      "送信データが大きすぎます。資料を減らしてください。",
      413,
    );
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("入力データがありません。");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new AppError("送信データが大きすぎます。", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function failure(e: unknown) {
  if (e instanceof AppError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError)
    return NextResponse.json(
      {
        error:
          "入力またはAIの応答形式が正しくありません。内容を確認し、再実行してください。",
      },
      { status: 422 },
    );
  return NextResponse.json(
    {
      error:
        "処理に失敗しました。ネットワークと接続設定を確認して、再実行してください。",
    },
    { status: 502 },
  );
}
export function sign(data: unknown) {
  return createHmac("sha256", key()).update(JSON.stringify(data)).digest("hex");
}
export function validSignature(data: unknown, signature: string) {
  const expected = Buffer.from(sign(data)),
    actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}

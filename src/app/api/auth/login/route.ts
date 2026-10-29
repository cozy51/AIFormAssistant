import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { origin, seal, cookieOptions, failure, AppError } from "@/lib/server";
export async function GET() {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
      throw new AppError(
        "Google OAuth のクライアントIDとシークレットを管理者が設定してください。",
        503,
      );
    const state = randomBytes(24).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: origin() + "/api/auth/callback",
      response_type: "code",
      scope:
        "openid email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    const res = NextResponse.redirect(u);
    res.cookies.set(
      "afa-oauth",
      seal({ state, verifier, expires: Date.now() + 600000 }),
      { ...cookieOptions(), maxAge: 600 },
    );
    return res;
  } catch (e) {
    return failure(e);
  }
}

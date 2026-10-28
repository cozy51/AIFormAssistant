import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  origin,
  unseal,
  seal,
  cookieOptions,
  checkAllowed,
  AppError,
} from "@/lib/server";
export async function GET(req: Request) {
  try {
    const u = new URL(req.url),
      saved = (await cookies()).get("afa-oauth")?.value;
    if (!saved || u.searchParams.has("error"))
      throw new AppError(
        "Google 接続がキャンセルされたか、認証が失敗しました。",
      );
    const state = unseal(saved);
    if (
      state.expires < Date.now() ||
      state.state !== u.searchParams.get("state") ||
      !u.searchParams.get("code")
    )
      throw new AppError("認証をやり直してください。");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        code: u.searchParams.get("code")!,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: origin() + "/api/auth/callback",
        grant_type: "authorization_code",
        code_verifier: state.verifier,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok)
      throw new AppError("Google のトークンを取得できませんでした。");
    const t = await res.json();
    const user = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${t.access_token}` },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!user.ok)
      throw new AppError("Google アカウントを確認できませんでした。");
    const p = await user.json();
    if (!p.email_verified || !p.sub)
      throw new AppError("確認済みメールアドレスが必要です。");
    checkAllowed(p.email);
    const response = NextResponse.redirect(origin());
    response.cookies.set(
      "afa-session",
      seal({
        sub: p.sub,
        email: p.email,
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: Date.now() + t.expires_in * 1000,
        sessionUntil: Date.now() + 604800000,
      }),
      { ...cookieOptions(), maxAge: 604800 },
    );
    response.cookies.delete("afa-oauth");
    return response;
  } catch (e) {
    const response = NextResponse.redirect(
      origin() +
        "/?authError=" +
        encodeURIComponent(
          e instanceof AppError
            ? e.message
            : "Google 接続に失敗しました。再試行してください。",
        ),
    );
    response.cookies.delete("afa-oauth");
    return response;
  }
}

import { NextResponse } from "next/server";
import { session } from "@/lib/server";
export async function GET() {
  let email: string | undefined;
  try {
    email = (await session()).email;
  } catch {}
  return NextResponse.json(
    {
      authenticated: !!email,
      email,
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      googleConfigured:
        !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";
import { guard, failure } from "@/lib/server";
export async function POST(req: Request) {
  try {
    await guard(req);
    const res = NextResponse.json({ ok: true });
    res.cookies.delete("afa-session");
    return res;
  } catch (e) {
    return failure(e);
  }
}

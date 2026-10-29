import { NextResponse } from "next/server";
import { guard, failure } from "@/lib/server";
import { monthlyLimit, readUsage } from "@/lib/usage";
export async function GET(req: Request) {
  try {
    const s = await guard(req);
    const { usage } = await readUsage(s);
    return NextResponse.json(
      { ...usage, limit: monthlyLimit() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}

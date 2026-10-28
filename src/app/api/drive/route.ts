import { NextResponse } from "next/server";
import { guard, body, failure } from "@/lib/server";
import { drive } from "@/lib/drive";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    const s = await guard(req);
    const { input } = z
      .object({ input: z.string().max(2048) })
      .parse(await body(req));
    const { meta, bytes, pageCount } = await drive(s, input, true);
    return NextResponse.json(
      {
        id: meta.id,
        name: meta.name,
        modifiedTime: meta.modifiedTime,
        size: bytes!.length,
        pageCount,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}

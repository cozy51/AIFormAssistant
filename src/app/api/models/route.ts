import { NextResponse } from "next/server";
import { guard, failure } from "@/lib/server";
import { client } from "@/lib/ai";
export async function GET(req: Request) {
  try {
    await guard(req);
    const pager = await client().models.list({ config: { pageSize: 100 } });
    const models: string[] = [];
    for await (const m of pager) {
      if (
        m.name?.startsWith("models/gemini-") &&
        !/preview|experimental|exp-|latest|embedding|image|tts|robotics/.test(
          m.name,
        ) &&
        m.supportedActions?.includes("generateContent")
      )
        models.push(m.name.replace("models/", ""));
    }
    return NextResponse.json({ models });
  } catch (e) {
    return failure(e);
  }
}

import { NextResponse } from "next/server";
import { gzipSync, gunzipSync } from "node:zlib";
import { guard, rawBody, failure, AppError } from "@/lib/server";
import { BackupSchema } from "@/lib/schema";
import { DATA_FILE, findFile, readFile, writeFile } from "@/lib/store";
export const maxDuration = 60;
export async function GET(req: Request) {
  try {
    const s = await guard(req);
    const file = await findFile(s, DATA_FILE);
    if (!file)
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    return new Response(gzipSync(await readFile(s, file.id)), {
      headers: {
        "Content-Type": "application/gzip",
        "Cache-Control": "no-store",
        "X-Modified-Time": file.modifiedTime,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const s = await guard(req);
    const base = req.headers.get("x-base-modified-time") || "";
    let text: string;
    try {
      text = gunzipSync(await rawBody(req, 4_000_000), {
        maxOutputLength: 100_000_000,
      }).toString();
    } catch (e) {
      if (e instanceof AppError)
        throw new AppError(
          "保存データが大きすぎます。不要なテンプレートや資料を削除してください。",
          413,
        );
      throw new AppError("保存データの形式を確認してください。");
    }
    const data = BackupSchema.parse(JSON.parse(text));
    const file = await findFile(s, DATA_FILE);
    if (file && file.modifiedTime !== base)
      return NextResponse.json(
        {
          error:
            "別の端末で Drive のデータが更新されています。どちらのデータを使うか選んでください。",
          conflict: true,
        },
        { status: 409 },
      );
    const saved = await writeFile(s, DATA_FILE, JSON.stringify(data), file?.id);
    return NextResponse.json(
      { modifiedTime: saved.modifiedTime },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}

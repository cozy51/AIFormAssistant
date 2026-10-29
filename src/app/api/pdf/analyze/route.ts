import { NextResponse } from "next/server";
import { splitPdf } from "@/lib/pdf";
import { z } from "zod";
import { guard, body, failure, sign, AppError } from "@/lib/server";
import { drive } from "@/lib/drive";
import { AnalysisSchema } from "@/lib/schema";
import { structured } from "@/lib/ai";
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    const s = await guard(req, true);
    const input = z
      .object({
        id: z.string(),
        model: z.string(),
        maxPages: z.number().int().min(1).max(300),
        maxSizeMB: z.number().min(1).max(40),
        consent: z.literal(true),
      })
      .parse(await body(req));
    const { meta, bytes, pageCount } = await drive(s, input.id, true);
    if (
      pageCount! > input.maxPages ||
      bytes!.length > input.maxSizeMB * 1024 * 1024
    )
      throw new AppError(
        "設定のPDFサイズ・ページ数上限を超えています。設定を確認してください。",
      );
    const analysis: z.infer<typeof AnalysisSchema> = {
      pages: [],
      warnings: [],
    };
    let parts;
    try {
      parts = await splitPdf(bytes!);
    } catch (e) {
      throw new AppError((e as Error).message);
    }
    for (const part of parts) {
      const start = part.start - 1,
        end = part.end;
      const out = await structured(
        AnalysisSchema,
        `添付PDFを全ページ解析する。全${pageCount}ページのうち元ページ${start + 1}〜${end}。pageは元PDFのページ番号にする。textには読み取った全テキストを含める。見出し・帳票項目と記入内容・表・図を構造化する。スキャンも認識し、曖昧な文字/数値/図表はuncertain=trueとしてwarningsへ詳細を記載。ページを省略しない。`,
        input.model,
        Buffer.from(part.bytes),
        s,
      );
      const pages = new Set(out.pages.map((p) => p.page));
      if (
        pages.size !== end - start ||
        out.pages.length !== end - start ||
        out.pages.some((p) => p.page < start + 1 || p.page > end)
      )
        throw new AppError(
          "PDFのページ解析に欠落があります。再解析してください。",
          422,
        );
      analysis.pages.push(...out.pages);
      analysis.warnings.push(...out.warnings);
    }
    analysis.pages.sort((a, b) => a.page - b.page);
    if (
      analysis.pages.every(
        (p) => !p.text.trim() && !p.fields.length && !p.tables.length,
      )
    )
      throw new AppError(
        "PDFの文字を認識できませんでした。鮮明なPDFを指定してください。",
        422,
      );
    const data = { id: meta.id, modifiedTime: meta.modifiedTime, analysis };
    return NextResponse.json(
      {
        ...data,
        pageCount,
        analyzedAt: new Date().toISOString(),
        signature: sign({ sub: s.sub, ...data }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, body, failure, AppError } from "@/lib/server";
import { DocSchema, ItemSchema, StatSchema, RuleSchema } from "@/lib/schema";
import { structured } from "@/lib/ai";
import { validateDocs } from "@/lib/sources";
const Output = z.object({
  items: z.array(ItemSchema),
  stats: z.array(StatSchema),
  rules: z.array(RuleSchema),
  warnings: z.array(z.string()),
});
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    const s = await guard(req, true);
    const input = z
      .object({
        docs: z.array(DocSchema),
        items: z.array(ItemSchema),
        model: z.string(),
        consent: z.literal(true),
      })
      .parse(await body(req));
    await validateDocs(input.docs, s);
    if (input.docs.some((d) => d.category === "current"))
      throw new AppError("テンプレート分析に今回案件の資料は使えません。");
    const out = await structured(
      Output,
      `過去実績から項目定義を抽出し、注意事項を解析する。既存項目がある場合はIDを維持し、意味が近い項目へ対応付けるが曖昧な対応はconfidenceを下げwarningsへ。statsは実績の項目ごとの記入文章を逐語的に記録し、構成、表現、専門用語、箇条書き傾向、記載粒度を分析する。rulesは共通ルール(itemId='')または項目IDに対応付け、必須、禁止、例、文字数、技術注意を分類する。矛盾は両方にconflictの説明を付けresolved=falseとし、勝手に選ばない。itemsの目標文字数は実績平均を参考に。すべての抽出はユーザーが後で確認する。入力JSON: ${JSON.stringify(input)}`,
      input.model,
    );
    const ids = new Set(out.items.map((i) => i.id));
    if (ids.size !== out.items.length)
      throw new AppError("項目IDが重複しています。再分析してください。", 422);
    for (const row of [...out.stats, ...out.rules]) {
      const d = input.docs.find((d) => d.id === row.fileId);
      const p = d?.analysis?.pages.find((p) => p.page === row.page);
      if (
        !p ||
        ("content" in row && d?.category !== "past") ||
        ("text" in row && d?.category !== "rules") ||
        (row.itemId && !ids.has(row.itemId))
      )
        throw new AppError(
          "分析結果の資料・項目対応が不正です。再分析してください。",
          422,
        );
      if ("content" in row) {
        const text = [p.text, ...p.fields.map((f) => f.content), ...p.tables]
          .join(" ")
          .replace(/\s/g, "");
        if (!text.includes(row.content.replace(/\s/g, "")))
          throw new AppError(
            "実績文章を元PDFと照合できませんでした。再分析してください。",
            422,
          );
      }
    }
    return NextResponse.json({
      ...out,
      stats: out.stats.map((row) => ({ ...row, confirmed: false })),
      rules: out.rules.map((row) => ({
        ...row,
        reviewed: false,
        resolved: false,
      })),
    });
  } catch (e) {
    return failure(e);
  }
}

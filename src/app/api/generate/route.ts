import { NextResponse } from "next/server";
import { z } from "zod";
import { guard, body, failure, AppError } from "@/lib/server";
import {
  DocSchema,
  TemplateSchema,
  ResultSchema,
  verifyReferences,
  statsFor,
} from "@/lib/schema";
import { structured } from "@/lib/ai";
import { validateDocs } from "@/lib/sources";
export const maxDuration = 300;
export async function POST(req: Request) {
  try {
    const s = await guard(req, true);
    const input = z
      .object({
        template: TemplateSchema,
        docs: z.array(DocSchema),
        itemId: z.string(),
        instruction: z.string().max(10000),
        draftText: z.string().max(40000).default(""),
        model: z.string(),
        consent: z.literal(true),
      })
      .parse(await body(req));
    const item = input.template.items.find((i) => i.id === input.itemId);
    if (!item) throw new AppError("項目が見つかりません。");
    const rules = input.template.rules.filter(
      (r) => !r.itemId || r.itemId === item.id,
    );
    if (rules.some((r) => !r.reviewed))
      throw new AppError(
        "注意事項の対応をテンプレートで確認し、確認済みにしてください。",
      );
    if (
      input.template.stats.some(
        (v) => (v.itemId === item.id || !v.itemId) && !v.confirmed,
      )
    )
      throw new AppError(
        "過去実績の項目対応をテンプレートで確認してください。",
      );
    if (rules.some((r) => r.conflict && !r.resolved))
      throw new AppError(
        "注意事項に未解決の競合があります。テンプレートで確認・修正してください。",
      );
    if (!input.docs.some((d) => d.category === "current"))
      throw new AppError("今回案件の解析済みPDFを登録してください。");
    await validateDocs(input.docs, s);
    const stats = input.template.stats.filter((v) => v.itemId === item.id);
    const sources = input.docs.map((d) => ({
      ...d,
      signature: undefined,
      analysis:
        d.category === "past"
          ? {
              pages: d.analysis!.pages.map((p) => ({
                ...p,
                text: "",
                tables: [],
                figures: [],
                fields: p.fields.filter((f) =>
                  stats.some(
                    (s) =>
                      s.fileId === d.id &&
                      s.page === p.page &&
                      s.sourceName === f.name,
                  ),
                ),
              })),
            }
          : d.analysis,
    }));
    const result = await structured(
      ResultSchema,
      `次の項目だけの文章候補を生成する。既存のユーザー文章は変更しない。characterCountはUnicode文字数、targetCharacterCountは指定値。今回案件の資料が不足する場合はmissingInformationと文章中の「要確認」で示す。確信度は0〜1。根拠引用はtext/fields/tables/figuresから逐語引用する。資料にない数値は書かない。\n${JSON.stringify({ templateName: input.template.name, item, stats, characterAnalysis: statsFor(input.template, item.id), rules, documents: sources, instruction: input.instruction, draftText: input.draftText })}`,
      input.model,
    );
    if (result.itemId !== item.id)
      throw new AppError("AIが別の項目を返しました。再実行してください。", 422);
    const verified = verifyReferences(
      { ...result, itemName: item.name, targetCharacterCount: item.target },
      input.docs,
    );
    if (!verified.references.some((r) => r.category === "current")) {
      verified.warnings.push(
        "今回案件の根拠を照合できません。採用前に資料を確認してください。",
      );
      verified.confidence = Math.min(verified.confidence, 0.3);
    }
    for (const reference of verified.references) {
      const source = input.docs.find((d) => d.id === reference.fileId);
      if (
        source?.analysis?.pages.find((p) => p.page === reference.page)
          ?.uncertain
      ) {
        verified.warnings.push(
          `${source.name} の${reference.page}ページは読み取りが不確実です。原本を確認してください。`,
        );
        verified.confidence = Math.min(verified.confidence, 0.6);
      }
    }
    return NextResponse.json(verified);
  } catch (e) {
    return failure(e);
  }
}

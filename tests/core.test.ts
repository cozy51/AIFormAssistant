import { describe, it, expect } from "vitest";
import {
  driveId,
  count,
  statsFor,
  verifyReferences,
  ResultSchema,
  BackupSchema,
  addCandidate,
} from "@/lib/schema";
import { doc, result, template } from "./fixtures";
describe("Drive URL", () => {
  it.each([
    "abcdefghijkl",
    "https://drive.google.com/file/d/abcdefghijkl/view?usp=sharing",
    "https://drive.google.com/open?id=abcdefghijkl",
    "https://drive.google.com/uc?id=abcdefghijkl",
  ])("%s", (v) => expect(driveId(v)).toBe("abcdefghijkl"));
  it.each([
    "https://evil.com/file/d/abcdefghijkl/view",
    "https://drive.google.com/drive/folders/abcdefghijkl",
    "javascript:alert(1)",
    "abc",
    "http://drive.google.com/file/d/abcdefghijkl/view",
  ])("reject %s", (v) => expect(() => driveId(v)).toThrow());
});
describe("生成結果", () => {
  it("参照をページ内容に照合して名前と文字数を補正", () => {
    const r = verifyReferences(structuredClone(result), [doc]);
    expect(r.references[0].fileName).toBe(doc.name);
    expect(r.characterCount).toBe(count(r.generatedText));
  });
  it.each([
    { page: 2 },
    { fileId: "unknown" },
    { quote: "999 mm" },
    { category: "past" as const },
  ])("架空の参照を除去 %j", (change) => {
    const r = verifyReferences(
      { ...result, references: [{ ...result.references[0], ...change }] },
      [doc],
    );
    expect(r.references).toHaveLength(0);
    expect(r.warnings).toHaveLength(1);
  });
  it("空白引用を拒否", () =>
    expect(() =>
      ResultSchema.parse({
        ...result,
        references: [{ ...result.references[0], quote: " " }],
      }),
    ).toThrow());
  it("不正な確信度を拒否", () =>
    expect(() => ResultSchema.parse({ ...result, confidence: 2 })).toThrow());
  it("編集文章を保持して再生成候補を追加", () => {
    const e = addCandidate(
      {
        itemId: "i1",
        text: "ユーザーが編集した文章",
        confirmed: true,
        candidates: [],
        edits: [],
      },
      result,
    );
    expect(e.text).toBe("ユーザーが編集した文章");
    expect(e.confirmed).toBe(true);
    expect(e.candidates).toHaveLength(1);
  });
  it("サロゲート文字は1文字", () => expect(count("機械🔧")).toBe(3));
  it("実績平均・最大最小", () => {
    const s = {
      itemId: "i1",
      sourceName: "変更",
      confirmed: true,
      fileId: "a",
      page: 1,
      content: "あいう",
      confidence: 1,
      structure: "",
      expressions: [],
      terms: [],
      granularity: "",
      bulletTrend: "",
    };
    expect(
      statsFor(
        { ...template, stats: [s, { ...s, content: "あいうえお" }] },
        "i1",
      ),
    ).toEqual({ average: 4, min: 3, max: 5, count: 2 });
  });
  it("不正バックアップを拒否", () => {
    expect(() => BackupSchema.parse({ version: 99, templates: [] })).toThrow();
    expect(() =>
      BackupSchema.parse({
        version: 1,
        exportedAt: "now",
        templates: [
          { ...template, items: [{ ...template.items[0], target: -1 }] },
        ],
        documents: [],
        cases: [],
      }),
    ).toThrow();
  });
});

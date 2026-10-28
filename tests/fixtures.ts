import type { Doc, Template, Result } from "@/lib/schema";
export const doc: Doc = {
  id: "abcdefghijkl",
  ownerId: "t1",
  category: "current",
  name: "今回資料.pdf",
  modifiedTime: "2026-01-01",
  size: 100,
  pageCount: 1,
  status: "analyzed",
  analysis: {
    pages: [
      {
        page: 1,
        text: "軸径を25 mmに変更する。",
        headings: ["変更"],
        fields: [{ name: "理由", content: "強度不足の改善" }],
        tables: [],
        figures: [],
        uncertain: false,
      },
    ],
    warnings: [],
  },
};
export const result: Result = {
  itemId: "i1",
  itemName: "変更内容",
  generatedText: "軸径を25 mmに変更する。",
  characterCount: 999,
  targetCharacterCount: 100,
  references: [
    {
      fileId: doc.id,
      fileName: "偽の名前",
      page: 1,
      quote: "軸径を25 mm",
      category: "current",
    },
  ],
  missingInformation: [],
  warnings: [],
  confidence: 0.9,
};
export const template: Template = {
  id: "t1",
  name: "設計変更",
  items: [
    {
      id: "i1",
      name: "変更内容",
      order: 0,
      description: "",
      rules: "",
      target: 100,
      examples: [],
      instruction: "",
    },
  ],
  stats: [],
  rules: [],
  updatedAt: "2026-01-01",
};

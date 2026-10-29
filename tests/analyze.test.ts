import { it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/analyze/route";
import { sign } from "@/lib/server";
import { structured } from "@/lib/ai";
import { doc, template } from "./fixtures";
vi.mock("@/lib/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server")>()),
  guard: vi.fn(async () => ({ sub: "user" })),
}));
vi.mock("@/lib/drive", () => ({
  drive: vi.fn(async () => ({ meta: { modifiedTime: "2026-01-01" } })),
}));
vi.mock("@/lib/ai", () => ({ structured: vi.fn() }));
const stats = {
  itemId: "i1",
  sourceName: "変更",
  confirmed: false,
  fileId: doc.id,
  page: 1,
  content: "軸径を25 mmに変更する。",
  confidence: 0.4,
  structure: "結論を先に",
  expressions: ["変更する"],
  terms: ["軸径"],
  granularity: "寸法を明記",
  bulletTrend: "なし",
};
beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-longer-than-thirty-two-characters";
  vi.mocked(structured).mockResolvedValue({
    items: template.items,
    stats: [stats],
    rules: [],
    warnings: ["項目対応を確認してください"],
  });
});
function request(category = "past") {
  const d = {
    ...doc,
    category,
    signature: sign({
      sub: "user",
      id: doc.id,
      modifiedTime: doc.modifiedTime,
      analysis: doc.analysis,
    }),
  };
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: JSON.stringify({
      docs: [d],
      items: [],
      model: "gemini-2.5-flash",
      consent: true,
    }),
  });
}
it("実績の項目抽出・文字量分析の入力を照合し曖昧な対応を未確認で返す", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  const out = await response.json();
  expect(out.items[0].name).toBe("変更内容");
  expect(out.stats[0].confidence).toBe(0.4);
  expect(out.stats[0].confirmed).toBe(false);
});
it("架空の実績文章を除外し警告する", async () => {
  vi.mocked(structured).mockResolvedValue({
    items: template.items,
    stats: [stats, { ...stats, content: "捏造された実績文章" }],
    rules: [],
    warnings: [],
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  const out = await response.json();
  expect(out.stats).toHaveLength(1);
  expect(out.stats[0].content).toBe(stats.content);
  expect(out.warnings[0]).toContain("捏造された実績文章");
});
it("存在しない項目への対応を除外し警告する", async () => {
  vi.mocked(structured).mockResolvedValue({
    items: template.items,
    stats: [{ ...stats, itemId: "missing" }],
    rules: [],
    warnings: [],
  });
  const out = await (await POST(request())).json();
  expect(out.stats).toHaveLength(0);
  expect(out.warnings).toHaveLength(1);
});
it("注意事項の資料がない場合に実績由来のルールを除外する", async () => {
  vi.mocked(structured).mockResolvedValue({
    items: template.items,
    stats: [stats],
    rules: [
      {
        id: "r1",
        fileId: doc.id,
        page: 1,
        text: "寸法を明記する",
        itemId: "i1",
        kind: "required",
        conflict: "",
        resolved: false,
        reviewed: false,
      },
    ],
    warnings: [],
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  const out = await response.json();
  expect(out.stats).toHaveLength(1);
  expect(out.rules).toHaveLength(0);
  expect(out.warnings[0]).toContain("寸法を明記する");
});
it("今回案件を実績分析へ混入させない", async () =>
  expect((await POST(request("current"))).status).toBe(400));
it("注意事項の競合は未確認・未解決として返す", async () => {
  vi.mocked(structured).mockResolvedValue({
    items: template.items,
    stats: [],
    rules: [
      {
        id: "r1",
        fileId: doc.id,
        page: 1,
        text: "10字以内",
        itemId: "i1",
        kind: "length",
        conflict: "100字以上と矛盾",
        resolved: true,
        reviewed: true,
      },
    ],
    warnings: [],
  });
  const response = await POST(request("rules"));
  expect(response.status).toBe(200);
  const out = await response.json();
  expect(out.rules[0].resolved).toBe(false);
  expect(out.rules[0].reviewed).toBe(false);
});

import { it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/generate/route";
import { guard, sign } from "@/lib/server";
import { structured } from "@/lib/ai";
import { drive } from "@/lib/drive";
import { template, doc, result } from "./fixtures";
vi.mock("@/lib/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server")>()),
  guard: vi.fn(async () => ({ sub: "user" })),
}));
vi.mock("@/lib/drive", () => ({
  drive: vi.fn(async () => ({ meta: { modifiedTime: "2026-01-01" } })),
}));
vi.mock("@/lib/ai", () => ({ structured: vi.fn() }));
beforeEach(() => {
  process.env.SESSION_SECRET = "tests-secret-over-thirty-two-characters";
  vi.mocked(structured).mockResolvedValue(structuredClone(result));
  vi.mocked(drive).mockResolvedValue({ meta: { modifiedTime: "2026-01-01" } });
  vi.mocked(guard).mockResolvedValue({ sub: "user" } as Awaited<
    ReturnType<typeof guard>
  >);
});
function request(overrides: Record<string, unknown> = {}) {
  const signed = {
    ...doc,
    signature: sign({
      sub: "user",
      id: doc.id,
      modifiedTime: doc.modifiedTime,
      analysis: doc.analysis,
    }),
  };
  return new Request("http://localhost/api/generate", {
    method: "POST",
    body: JSON.stringify({
      template,
      docs: [signed],
      itemId: "i1",
      instruction: "",
      model: "gemini-2.5-flash",
      consent: true,
      ...overrides,
    }),
  });
}
it("署名・更新日時を検証して生成結果の参照と文字数を照合", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  const value = await response.json();
  expect(value.references[0].fileName).toBe(doc.name);
  expect(value.characterCount).not.toBe(999);
  const prompt = vi.mocked(structured).mock.calls.at(-1)?.[1];
  expect(prompt).toContain("今回");
});
it("今回案件がない場合は生成しない", async () => {
  const response = await POST(request({ docs: [] }));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("今回案件");
});
it("署名がないインポート済み資料は再解析を案内", async () => {
  const response = await POST(request({ docs: [doc] }));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("再解析");
});
it("原本更新時はキャッシュで生成しない", async () => {
  vi.mocked(drive).mockResolvedValue({ meta: { modifiedTime: "new" } });
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("更新");
});
it("未解決のルール競合を勝手に選択しない", async () => {
  const t = {
    ...template,
    rules: [
      {
        id: "r1",
        fileId: doc.id,
        page: 1,
        text: "10字以内",
        itemId: "i1",
        kind: "length",
        conflict: "最低100字と矛盾",
        resolved: false,
        reviewed: true,
      },
    ],
  };
  const response = await POST(request({ template: t }));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("競合");
});
it("存在しない引用とページ番号を除去する", async () => {
  vi.mocked(structured).mockResolvedValue({
    ...result,
    references: [{ ...result.references[0], page: 999 }],
  });
  const response = await POST(request());
  const data = await response.json();
  expect(data.references).toEqual([]);
  expect(data.confidence).toBeLessThanOrEqual(0.3);
  expect(data.warnings.length).toBeGreaterThan(0);
});
it("AIが異なる項目IDを返した場合は拒否", async () => {
  vi.mocked(structured).mockResolvedValue({ ...result, itemId: "wrong" });
  expect((await POST(request())).status).toBe(422);
});

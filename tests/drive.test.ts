import { it, expect, vi, afterEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { drive } from "@/lib/drive";
import type { Session } from "@/lib/server";
vi.mock("@/lib/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server")>();
  return { ...actual, token: vi.fn(async () => "test-access") };
});
const s = { sub: "s" } as Session;
afterEach(() => vi.unstubAllGlobals());
it("Drive PDFを取得して実ページ数を返す", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const mock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        id: "abcdefghijkl",
        mimeType: "application/pdf",
        size: bytes.length,
        name: "資料.pdf",
        modifiedTime: "today",
      }),
    )
    .mockResolvedValueOnce(new Response(new Uint8Array(bytes)));
  vi.stubGlobal("fetch", mock);
  const result = await drive(s, "abcdefghijkl", true);
  expect(result.pageCount).toBe(1);
  expect(result.bytes?.length).toBe(bytes.length);
  expect(mock.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer test-access",
  );
});
it.each([
  [404, "ファイルが見つかりません"],
  [403, "アクセス権"],
  [401, "再接続"],
])("Drive %i エラーを日本語化", async (status, message) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: Number(status) })),
  );
  await expect(drive(s, "abcdefghijkl")).rejects.toThrow(String(message));
});
it("PDF以外を拒否", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ mimeType: "application/vnd.google-apps.folder" }),
    ),
  );
  await expect(drive(s, "abcdefghijkl")).rejects.toThrow("PDF以外");
});

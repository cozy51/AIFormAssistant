import { it, expect, vi, beforeEach } from "vitest";
import { gzipSync } from "node:zlib";
import { POST } from "@/app/api/store/route";
import { findFile, writeFile } from "@/lib/store";
vi.mock("@/lib/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server")>()),
  guard: vi.fn(async () => ({ sub: "user" })),
}));
vi.mock("@/lib/store", () => ({
  DATA_FILE: "data.json",
  findFile: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
const data = {
  version: 1,
  exportedAt: "2026-01-01",
  templates: [],
  documents: [],
  cases: [],
};
function request(base: string, value: unknown = data) {
  return new Request("http://localhost/api/store", {
    method: "POST",
    headers: { "X-Base-Modified-Time": base },
    body: gzipSync(JSON.stringify(value)),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(writeFile).mockResolvedValue({ id: "f1", modifiedTime: "new" });
});
it("Drive のファイルを基準の版から更新する", async () => {
  vi.mocked(findFile).mockResolvedValue({ id: "f1", modifiedTime: "old" });
  const response = await POST(request("old"));
  expect(response.status).toBe(200);
  expect((await response.json()).modifiedTime).toBe("new");
  expect(vi.mocked(writeFile).mock.calls[0][3]).toBe("f1");
});
it("別の端末で更新されていれば上書きせず競合を返す", async () => {
  vi.mocked(findFile).mockResolvedValue({ id: "f1", modifiedTime: "other" });
  const response = await POST(request("old"));
  expect(response.status).toBe(409);
  expect(writeFile).not.toHaveBeenCalled();
});
it("ファイルがなければ新規作成する", async () => {
  vi.mocked(findFile).mockResolvedValue(null);
  expect((await POST(request(""))).status).toBe(200);
  expect(vi.mocked(writeFile).mock.calls[0][3]).toBeUndefined();
});
it("形式が不正なデータは保存しない", async () => {
  vi.mocked(findFile).mockResolvedValue(null);
  expect((await POST(request("", { version: 2 }))).status).toBe(422);
  expect(writeFile).not.toHaveBeenCalled();
});

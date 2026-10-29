import { it, expect, vi, beforeEach } from "vitest";
import { checkUsage, addUsage, monthlyLimit } from "@/lib/usage";
import { findFile, readFile, writeFile } from "@/lib/store";
vi.mock("@/lib/store", () => ({
  USAGE_FILE: "usage.json",
  findFile: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
const s = {
  sub: "user",
  email: "a@example.com",
  accessToken: "t",
  expiresAt: 0,
  sessionUntil: 0,
};
const month = new Date()
  .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
  .slice(0, 7);
beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.GEMINI_MONTHLY_TOKEN_LIMIT;
  vi.mocked(findFile).mockResolvedValue({ id: "f1", modifiedTime: "x" });
});
it("上限の既定値と0による無制限を解釈する", () => {
  expect(monthlyLimit()).toBe(5_000_000);
  process.env.GEMINI_MONTHLY_TOKEN_LIMIT = "";
  expect(monthlyLimit()).toBe(5_000_000);
  process.env.GEMINI_MONTHLY_TOKEN_LIMIT = "0";
  expect(monthlyLimit()).toBe(0);
});
it("今月の使用量が上限に達したらAI処理を止める", async () => {
  process.env.GEMINI_MONTHLY_TOKEN_LIMIT = "1000";
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ month, tokens: 1000, calls: 3 }),
  );
  await expect(checkUsage(s)).rejects.toMatchObject({ status: 429 });
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ month, tokens: 999, calls: 3 }),
  );
  await expect(checkUsage(s)).resolves.toBeUndefined();
});
it("前月の使用量は今月に持ち越さない", async () => {
  process.env.GEMINI_MONTHLY_TOKEN_LIMIT = "1000";
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ month: "2000-01", tokens: 99999, calls: 3 }),
  );
  await expect(checkUsage(s)).resolves.toBeUndefined();
});
it("使用トークンを加算して保存する", async () => {
  vi.mocked(readFile).mockResolvedValue(
    JSON.stringify({ month, tokens: 100, calls: 1 }),
  );
  await addUsage(s, 50);
  const [, name, content, id] = vi.mocked(writeFile).mock.calls[0];
  expect(name).toBe("usage.json");
  expect(id).toBe("f1");
  expect(JSON.parse(content)).toMatchObject({ month, tokens: 150, calls: 2 });
});

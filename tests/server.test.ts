import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  seal,
  unseal,
  sign,
  validSignature,
  checkAllowed,
  guard,
  body,
  limit,
} from "@/lib/server";
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-long-enough-1234567890";
  process.env.APP_URL = "http://localhost:3000";
  process.env.APP_ALLOWED_EMAILS = "allowed@example.com";
});
describe("サーバー保護", () => {
  it("トークンを暗号化し改ざんを拒否", () => {
    const encrypted = seal({ accessToken: "private-token" });
    expect(encrypted).not.toContain("private-token");
    expect(unseal(encrypted)).toEqual({ accessToken: "private-token" });
    expect(() => unseal("X" + encrypted.slice(1))).toThrow();
  });
  it("解析内容に署名を結び付ける", () => {
    const value = { id: "pdf", analysis: { text: "本文" } };
    const signature = sign(value);
    expect(validSignature(value, signature)).toBe(true);
    expect(validSignature({ ...value, id: "other" }, signature)).toBe(false);
  });
  it("利用者をメール許可リストで制限", () => {
    expect(() => checkAllowed("ALLOWED@example.com")).not.toThrow();
    expect(() => checkAllowed("other@example.com")).toThrow();
    process.env.APP_ALLOWED_EMAILS = "";
    expect(() => checkAllowed("any@example.com")).toThrow();
  });
  it("外部Originを拒否", async () => {
    await expect(
      guard(
        new Request("http://localhost:3000/api/generate", {
          method: "POST",
          headers: { origin: "https://evil.com" },
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("未認証アクセスを拒否", async () => {
    await expect(
      guard(
        new Request("http://localhost:3000/api/generate", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("サイズ制限はcontent-lengthがなくても適用", async () => {
    await expect(
      body(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ text: "a".repeat(100) }),
        }),
        20,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("AIリクエストの回数制限", () => {
    const id = crypto.randomUUID();
    for (let i = 0; i < 12; i++) limit(id, true);
    expect(() => limit(id, true)).toThrow();
  });
});

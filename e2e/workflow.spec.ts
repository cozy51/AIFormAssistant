import { test, expect } from "@playwright/test";
import { result } from "../tests/fixtures";
test("テンプレート・案件・候補・編集・確定・再読込・バックアップ", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        authenticated: true,
        email: "test@example.com",
        geminiConfigured: true,
        googleConfigured: true,
        model: "gemini-2.5-flash",
      },
    }),
  );
  await page.route("**/api/generate", async (r) => {
    const b = r.request().postDataJSON();
    await r.fulfill({
      json: {
        ...result,
        itemId: b.itemId,
        generatedText: b.instruction.includes("短く")
          ? "短い候補文章"
          : "軸径を25 mmに変更します。",
      },
    });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "資料を根拠に、伝わる帳票へ。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "帳票テンプレートを登録" }).click();
  await page
    .getByRole("textbox", { name: "テンプレート名" })
    .fill("設計変更申請書");
  await page.getByRole("button", { name: "作成する", exact: true }).click();
  await page.getByRole("button", { name: "項目を追加" }).click();
  await page.locator("summary").filter({ hasText: "新しい項目" }).click();
  await page
    .getByRole("textbox", { name: "項目名", exact: true })
    .fill("変更内容");
  await page
    .getByRole("button", { name: "テンプレートを保存", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ダッシュボード", exact: true })
    .click();
  await page
    .getByRole("button", { name: "新しい案件を作成", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "案件名", exact: true })
    .fill("ブラケット変更");
  await page.getByRole("button", { name: "作成する", exact: true }).click();
  await page
    .getByRole("button", { name: "この項目を生成", exact: true })
    .click();
  await expect(page.getByText("候補 1", { exact: true })).toBeVisible();
  const editor = page.getByRole("textbox", { name: "生成文章の編集" });
  await expect(editor).toHaveValue("");
  await page
    .getByRole("button", { name: "この候補を採用", exact: true })
    .click();
  await expect(editor).toHaveValue("軸径を25 mmに変更します。");
  await editor.fill("ユーザーが確認・編集した文章。");
  await page.getByRole("button", { name: "短くする", exact: true }).click();
  await expect(page.getByText("候補 2", { exact: true })).toBeVisible();
  await expect(editor).toHaveValue("ユーザーが確認・編集した文章。");
  await page.getByRole("button", { name: "コピー", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("ユーザーが確認・編集した文章。");
  await page
    .getByRole("button", { name: "この文章を確定", exact: true })
    .click();
  await expect(
    page.getByText("1 / 1 項目を確定", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "案件・作成履歴", exact: true })
    .click();
  await page
    .getByRole("button", { name: /ブラケット変更/ })
    .first()
    .click();
  await expect(editor).toHaveValue("ユーザーが確認・編集した文章。");
  await expect(
    page.getByRole("button", { name: "確定を解除", exact: true }),
  ).toBeVisible();
  await page.getByText("編集履歴・復元", { exact: false }).click();
  await expect(
    page.getByText("軸径を25 mmに変更します。", { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "この文章へ復元", exact: true })
    .first()
    .click();
  await expect(editor).toHaveValue("軸径を25 mmに変更します。");
  await expect(
    page.getByRole("button", { name: "この文章を確定", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONをエクスポート" }).click();
  const file = await download;
  const path = await file.path();
  expect(path).toBeTruthy();
  await page.locator("input[type=file]").setInputFiles(path!);
  await expect(
    page.getByRole("heading", { name: "インポート前の確認" }),
  ).toBeVisible();
  await expect(page.getByText("重複するデータ：2件")).toBeVisible();
  await page
    .getByRole("button", { name: "確認してインポート", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("インポートが完了");
  await page.screenshot({ path: "test-results/settings.png", fullPage: true });
});
test("未認証APIを拒否し、モバイルとダーク表示が動作する", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/generate", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {},
  });
  expect(response.status()).toBe(401);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "表示モードを切り替え" }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "設定とデータ管理" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("PDF登録・PDF.jsの実Worker解析・解析キャッシュ再利用", async ({
  page,
}) => {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Manufacturing PDF test", { x: 40, y: 700, font });
  const bytes = Buffer.from(await pdf.save());
  const meta = {
    id: "abcdefghijkl",
    name: "test.pdf",
    modifiedTime: "2026-10-28T00:00:00Z",
    size: bytes.length,
    pageCount: 1,
  };
  let calls = 0;
  await page.route("**/api/drive", (r) => r.fulfill({ json: meta }));
  await page.route("**/api/pdf?id=*", (r) =>
    r.fulfill({ contentType: "application/pdf", body: bytes }),
  );
  await page.route("**/api/pdf/analyze", (r) => {
    calls++;
    return r.fulfill({
      json: {
        ...meta,
        signature: "mock-signed-analysis",
        analyzedAt: "2026-10-28T00:00:00Z",
        analysis: {
          pages: [
            {
              page: 1,
              text: "Manufacturing PDF test",
              headings: [],
              fields: [],
              tables: [],
              figures: [],
              uncertain: false,
            },
          ],
          warnings: [],
        },
      },
    });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "帳票テンプレートを登録" }).click();
  await page.getByRole("textbox", { name: "テンプレート名" }).fill("PDF検証");
  await page.getByRole("button", { name: "作成する", exact: true }).click();
  const section = page.locator(".document-section").first();
  await section
    .getByRole("textbox")
    .fill("https://drive.google.com/file/d/abcdefghijkl/view");
  await section.getByRole("button", { name: "登録", exact: true }).click();
  await expect(section.getByText("test.pdf", { exact: true })).toBeVisible();
  await section.getByRole("button", { name: "PDF.jsで本文確認" }).click();
  await expect(section.locator("pre")).toContainText("Manufacturing PDF test");
  await section.getByRole("button", { name: "解析・更新確認" }).click();
  await expect(section.getByText("解析済み", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  await section.getByRole("button", { name: "解析・更新確認" }).click();
  await expect(page.getByRole("status")).toContainText("ファイルに変更がない");
  expect(calls).toBe(1);
});

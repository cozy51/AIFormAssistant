import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db, backup, importBackup, removeTemplate } from "@/lib/db";
import { doc, template, result } from "./fixtures";
beforeEach(async () => {
  await Promise.all([
    db.templates.clear(),
    db.documents.clear(),
    db.cases.clear(),
    db.settings.clear(),
  ]);
});
afterAll(() => db.close());
describe("IndexedDB", () => {
  it("再接続後も生成結果・編集履歴・確定状態を保持", async () => {
    await db.cases.put({
      id: "c1",
      name: "案件",
      templateId: template.id,
      template,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      instruction: "指示",
      entries: [
        {
          itemId: "i1",
          text: "確定文章",
          confirmed: true,
          candidates: [{ id: "v1", createdAt: "now", result }],
          edits: [{ id: "e1", text: "編集前", at: "now" }],
        },
      ],
    });
    db.close();
    await db.open();
    const c = await db.cases.get("c1");
    expect(c?.entries[0].confirmed).toBe(true);
    expect(c?.entries[0].edits[0].text).toBe("編集前");
  });
  it("バックアップから署名と機密情報を除去", async () => {
    await db.templates.put(template);
    await db.documents.put({ ...doc, signature: "session-signature" });
    const data = await backup();
    expect(data.documents[0].signature).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("session-signature");
  });
  it("重複保持と明示置換", async () => {
    await db.templates.put(template);
    const input = {
      version: 1,
      exportedAt: "now",
      templates: [{ ...template, name: "変更済み" }],
      documents: [doc],
      cases: [],
    };
    await importBackup(input, false);
    expect((await db.templates.get("t1"))?.name).toBe("設計変更");
    await importBackup(input, true);
    expect((await db.templates.get("t1"))?.name).toBe("変更済み");
    expect(await db.documents.count()).toBe(1);
  });
  it("不正インポートで保存済みデータを変更しない", async () => {
    await db.templates.put(template);
    await expect(importBackup({ version: 2 }, true)).rejects.toThrow();
    expect(await db.templates.count()).toBe(1);
  });
  it("テンプレート削除時に関連PDFも削除", async () => {
    await db.templates.put(template);
    await db.documents.put(doc);
    await removeTemplate("t1");
    expect(await db.documents.count()).toBe(0);
    expect(await db.templates.count()).toBe(0);
  });
});

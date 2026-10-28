import { it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { splitPdf } from "@/lib/pdf";
it("PDFをページ番号を維持して分割し、全ページを含む", async () => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 43; i++) pdf.addPage();
  const parts = await splitPdf(await pdf.save());
  expect(parts.map((p) => [p.start, p.end])).toEqual([
    [1, 20],
    [21, 40],
    [41, 43],
  ]);
  for (const p of parts)
    expect((await PDFDocument.load(p.bytes)).getPageCount()).toBe(
      p.end - p.start + 1,
    );
});
it("単一ページが送信上限を超えた場合は明確に失敗", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await expect(splitPdf(await pdf.save(), 10)).rejects.toThrow("圧縮");
});

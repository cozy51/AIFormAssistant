import { PDFDocument } from "pdf-lib";
/** Inline Gemini requests remain below the 20 MB request limit, including base64 overhead. */
export async function splitPdf(
  bytes: Uint8Array,
  maxBytes = 13 * 1024 * 1024,
  maxPages = 20,
) {
  const source = await PDFDocument.load(bytes),
    parts: { bytes: Uint8Array; start: number; end: number }[] = [];
  let start = 0;
  while (start < source.getPageCount()) {
    let n = Math.min(maxPages, source.getPageCount() - start);
    while (true) {
      const pdf = await PDFDocument.create();
      for (const page of await pdf.copyPages(
        source,
        Array.from({ length: n }, (_, i) => start + i),
      ))
        pdf.addPage(page);
      const data = await pdf.save();
      if (data.length <= maxBytes) {
        parts.push({ bytes: data, start: start + 1, end: start + n });
        start += n;
        break;
      }
      if (n === 1)
        throw new Error(
          "1ページのデータが大きすぎます。画像を圧縮したPDFを指定してください。",
        );
      n = Math.max(1, Math.floor(n / 2));
    }
  }
  return parts;
}

import "server-only";
import { PDFDocument } from "pdf-lib";
import { AppError, token, type Session } from "./server";
import { driveId } from "./schema";
export async function drive(s: Session, input: string, download = false) {
  const id = driveId(input),
    access = await token(s);
  const headers = { Authorization: `Bearer ${access}` };
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  const meta = await fetch(
    url +
      "?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,size,trashed",
    { headers, signal: AbortSignal.timeout(30000), cache: "no-store" },
  );
  if (!meta.ok)
    throw new AppError(
      meta.status === 404
        ? "ファイルが見つかりません。IDと共有設定を確認してください。"
        : meta.status === 403
          ? "このPDFへのアクセス権がありません。共有設定を確認してください。"
          : meta.status === 401
            ? "Google に再接続してください。"
            : "Google Drive から取得できませんでした。",
      meta.status === 401 ? 401 : 400,
    );
  const m = await meta.json();
  if (m.trashed) throw new AppError("このファイルはゴミ箱にあります。");
  if (m.mimeType !== "application/pdf")
    throw new AppError("PDF以外のファイルは登録できません。");
  if (Number(m.size) > 40 * 1024 * 1024)
    throw new AppError("PDFは40MB以下にしてください。");
  if (!download) return { meta: m };
  const response = await fetch(url + "?alt=media&supportsAllDrives=true", {
    headers,
    signal: AbortSignal.timeout(60000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new AppError(
      "PDFをダウンロードできませんでした。Google の接続を確認してください。",
    );
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 40 * 1024 * 1024) {
      await reader.cancel();
      throw new AppError("PDFは40MB以下にしてください。");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  let pageCount = 0;
  try {
    pageCount = (await PDFDocument.load(bytes)).getPageCount();
  } catch {
    throw new AppError(
      "PDFを読み取れません。破損やパスワード保護を確認してください。",
    );
  }
  if (pageCount > 300)
    throw new AppError("300ページ以下のPDFを指定してください。");
  return { meta: m, bytes, pageCount };
}

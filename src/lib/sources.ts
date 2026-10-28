import "server-only";
import { type Doc } from "./schema";
import { AppError, validSignature, type Session } from "./server";
import { drive } from "./drive";
export async function validateDocs(docs: Doc[], s: Session) {
  if (!docs.length) throw new AppError("解析済みPDFを登録してください。");
  if (docs.length > 30)
    throw new AppError("一度に使用するPDFは30件以下にしてください。");
  for (const d of docs) {
    if (
      !d.analysis ||
      !d.signature ||
      !validSignature(
        {
          sub: s.sub,
          id: d.id,
          modifiedTime: d.modifiedTime,
          analysis: d.analysis,
        },
        d.signature,
      )
    )
      throw new AppError(
        `${d.name} を再解析してください。バックアップからの復元後や再ログイン時にも必要な場合があります。`,
      );
    const { meta } = await drive(s, d.id);
    if (meta.modifiedTime !== d.modifiedTime)
      throw new AppError(
        `${d.name} が更新されています。資料一覧で再解析してください。`,
      );
    if (d.analysis.pages.some((p) => p.page > d.pageCount))
      throw new AppError("ページ情報が不正です。再解析してください。");
  }
}

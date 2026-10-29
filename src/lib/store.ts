import "server-only";
import { AppError, token, type Session } from "./server";
export const DATA_FILE = "ai-form-assistant-data.json";
export const USAGE_FILE = "ai-form-assistant-usage.json";
const API = "https://www.googleapis.com/drive/v3/files";
export function folderId() {
  const value = (process.env.DRIVE_FOLDER_ID || "").trim();
  const id = value.match(/\/folders\/([\w-]+)/)?.[1] || value;
  return /^[\w-]{10,200}$/.test(id) ? id : "";
}
function requireFolder() {
  const id = folderId();
  if (!id)
    throw new AppError(
      "管理者が保存先の DRIVE_FOLDER_ID を設定してください。",
      503,
    );
  return id;
}
function driveError(status: number, action: string) {
  return new AppError(
    status === 401
      ? "Google に再接続してください。"
      : status === 403
        ? `保存先フォルダへの${action}権限がありません。設定から Google に再接続し、フォルダの共有設定も確認してください。`
        : status === 404
          ? "保存先フォルダが見つかりません。DRIVE_FOLDER_ID と共有設定を確認してください。"
          : `Google Drive への${action}に失敗しました。再実行してください。`,
    status === 401 ? 401 : status === 403 || status === 404 ? 403 : 502,
  );
}
export type StoredFile = { id: string; modifiedTime: string };
export async function findFile(
  s: Session,
  name: string,
): Promise<StoredFile | null> {
  const q = `name = '${name}' and '${requireFolder()}' in parents and trashed = false`;
  const res = await fetch(
    `${API}?${new URLSearchParams({
      q,
      fields: "files(id,modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: "1",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    })}`,
    {
      headers: { Authorization: `Bearer ${await token(s)}` },
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    },
  );
  if (!res.ok) throw driveError(res.status, "読み取り");
  return (await res.json()).files?.[0] || null;
}
export async function readFile(s: Session, id: string) {
  const res = await fetch(
    `${API}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${await token(s)}` },
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    },
  );
  if (!res.ok) throw driveError(res.status, "読み取り");
  return res.text();
}
export async function writeFile(
  s: Session,
  name: string,
  content: string,
  existing?: string,
): Promise<StoredFile> {
  const boundary = "afa" + Math.random().toString(36).slice(2);
  const metadata = existing ? {} : { name, parents: [requireFolder()] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files${existing ? "/" + encodeURIComponent(existing) : ""}?uploadType=multipart&supportsAllDrives=true&fields=id,modifiedTime`,
    {
      method: existing ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${await token(s)}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!res.ok) throw driveError(res.status, "保存");
  return res.json();
}

export async function api<T>(url: string, data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: data === undefined ? "GET" : "POST",
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new Error("ネットワークに接続できません。接続を確認してください。");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("サーバーの応答を確認できません。再実行してください。");
  }
  if (!response.ok) throw new Error(result.error || "処理に失敗しました。");
  return result;
}
export const consent = () =>
  window.confirm(
    "登録資料のPDF本文・解析情報を Google Gemini API に送信して解析・文章生成します。社内の情報管理ルールとGoogleのデータ利用条件を確認済みですか？",
  );
export function downloadJson(value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `AI帳票バックアップ-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

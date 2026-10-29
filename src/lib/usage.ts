import "server-only";
import { AppError, type Session } from "./server";
import { USAGE_FILE, findFile, readFile, writeFile } from "./store";
export type Usage = { month: string; tokens: number; calls: number };
export const monthlyLimit = () => {
  const raw = process.env.GEMINI_MONTHLY_TOKEN_LIMIT?.trim();
  const value = raw ? Number(raw) : 5_000_000;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};
const month = () =>
  new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })
    .slice(0, 7);
export async function readUsage(s: Session) {
  const file = await findFile(s, USAGE_FILE);
  let usage: Usage = { month: month(), tokens: 0, calls: 0 };
  if (file) {
    try {
      const saved = JSON.parse(await readFile(s, file.id));
      if (saved.month === usage.month)
        usage = {
          month: usage.month,
          tokens: Number(saved.tokens) || 0,
          calls: Number(saved.calls) || 0,
        };
    } catch {}
  }
  return { file, usage };
}
export async function checkUsage(s: Session) {
  const limit = monthlyLimit();
  if (!limit) return;
  const { usage } = await readUsage(s);
  if (usage.tokens >= limit)
    throw new AppError(
      `今月のAI使用量が上限（${limit.toLocaleString("ja-JP")}トークン）に達したため、AIの処理を停止しています。翌月まで待つか、管理者が GEMINI_MONTHLY_TOKEN_LIMIT を見直してください。`,
      429,
    );
}
export async function addUsage(s: Session, tokens: number) {
  const { file, usage } = await readUsage(s);
  const next = {
    ...usage,
    tokens: usage.tokens + tokens,
    calls: usage.calls + 1,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(s, USAGE_FILE, JSON.stringify(next, null, 2), file?.id);
}

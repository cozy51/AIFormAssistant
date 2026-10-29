import { db } from "./db";
import { BackupSchema, now, type Backup } from "./schema";
export type SyncStatus = {
  state: "off" | "idle" | "saving" | "dirty" | "error";
  message?: string;
  savedAt?: string;
};
type Meta = { remote: string; dirty: boolean };
const KEY = "afa-sync";
let status: SyncStatus = { state: "off" },
  enabled = false,
  applying = false,
  hooked = false,
  version = 0,
  timer: ReturnType<typeof setTimeout> | undefined,
  running: Promise<void> | null = null;
const listeners = new Set<(s: SyncStatus) => void>();
function set(next: SyncStatus) {
  status = next;
  listeners.forEach((f) => f(status));
}
export function subscribeSync(f: (s: SyncStatus) => void) {
  listeners.add(f);
  f(status);
  return () => {
    listeners.delete(f);
  };
}
function readMeta(): Meta {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { remote: String(value.remote || ""), dirty: !!value.dirty };
  } catch {
    return { remote: "", dirty: false };
  }
}
function writeMeta(meta: Meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {}
}
export async function snapshot(): Promise<Backup> {
  return BackupSchema.parse({
    version: 1,
    exportedAt: now(),
    templates: await db.templates.toArray(),
    documents: await db.documents.toArray(),
    cases: await db.cases.toArray(),
    settings: await db.settings.get("main"),
  });
}
async function apply(data: Backup) {
  applying = true;
  try {
    await db.transaction(
      "rw",
      db.templates,
      db.documents,
      db.cases,
      db.settings,
      async () => {
        await Promise.all([
          db.templates.clear(),
          db.documents.clear(),
          db.cases.clear(),
        ]);
        await db.templates.bulkPut(data.templates);
        await db.documents.bulkPut(data.documents);
        await db.cases.bulkPut(data.cases);
        if (data.settings) await db.settings.put(data.settings);
      },
    );
  } finally {
    applying = false;
  }
}
async function errorOf(res: Response, fallback: string) {
  try {
    return (await res.json()).error || fallback;
  } catch {
    return res.status === 413
      ? "保存データが大きすぎます。不要なテンプレートや資料を削除してください。"
      : fallback;
  }
}
async function pull() {
  const res = await fetch("/api/store", { cache: "no-store" });
  if (res.status === 204) return null;
  if (!res.ok)
    throw new Error(await errorOf(res, "Drive から読み込めませんでした。"));
  const text = await new Response(
    res.body!.pipeThrough(new DecompressionStream("gzip")),
  ).text();
  return {
    data: BackupSchema.parse(JSON.parse(text)),
    modified: res.headers.get("X-Modified-Time") || "",
  };
}
async function push(base: string): Promise<string | null> {
  const body = await new Response(
    new Blob([JSON.stringify(await snapshot())])
      .stream()
      .pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  const res = await fetch("/api/store", {
    method: "POST",
    headers: {
      "Content-Type": "application/gzip",
      "X-Base-Modified-Time": base,
    },
    body,
  });
  if (res.status === 409) return null;
  if (!res.ok)
    throw new Error(await errorOf(res, "Drive に保存できませんでした。"));
  return (await res.json()).modifiedTime;
}
async function save(base: string) {
  const before = version;
  let modified = await push(base);
  if (modified === null) {
    const remote = await pull();
    if (
      remote &&
      window.confirm(
        "別の端末で Drive に保存された新しいデータがあります。\n\nOK：Drive のデータを読み込む（この端末の未保存の変更は破棄されます）\nキャンセル：この端末のデータで Drive を上書きする",
      )
    ) {
      await apply(remote.data);
      writeMeta({ remote: remote.modified, dirty: false });
      return;
    }
    modified = await push(remote?.modified || "");
    if (modified === null)
      throw new Error("Drive の更新が競合しました。再度同期してください。");
  }
  writeMeta({ remote: modified, dirty: version !== before });
}
async function run() {
  set({ ...status, state: "saving", message: undefined });
  try {
    const meta = readMeta();
    const local =
      (await db.templates.count()) +
      (await db.cases.count()) +
      (await db.documents.count());
    const dirty = meta.dirty || (!meta.remote && local > 0);
    const remote = await pull();
    if (!remote) {
      if (dirty || local > 0) await save("");
    } else if (remote.modified === meta.remote) {
      if (dirty) await save(meta.remote);
    } else if (!dirty) {
      await apply(remote.data);
      writeMeta({ remote: remote.modified, dirty: false });
    } else await save(meta.remote);
    const after = readMeta();
    set({
      state: after.dirty ? "dirty" : "idle",
      savedAt: new Date().toISOString(),
    });
    if (after.dirty) schedule();
  } catch (e) {
    set({ ...status, state: "error", message: (e as Error).message });
  }
}
export function syncNow() {
  if (!enabled) return Promise.resolve();
  if (!running)
    running = run().finally(() => {
      running = null;
    });
  return running;
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (running) schedule();
    else void syncNow();
  }, 3000);
}
function mark(settings = false) {
  if (applying) return;
  const meta = readMeta();
  if (settings && !meta.remote) return;
  version++;
  writeMeta({ ...meta, dirty: true });
  if (enabled) {
    set({ ...status, state: "dirty" });
    schedule();
  }
}
export const markChanged = () => mark();
export function installSyncHooks() {
  if (hooked) return;
  hooked = true;
  for (const table of [db.templates, db.documents, db.cases, db.settings]) {
    const settings = table === db.settings;
    table.hook("creating", () => mark(settings));
    table.hook("updating", () => mark(settings));
    table.hook("deleting", () => mark(settings));
  }
}
export function startSync() {
  installSyncHooks();
  if (enabled) return syncNow();
  enabled = true;
  window.addEventListener("beforeunload", (e) => {
    if (status.state === "saving" || status.state === "dirty")
      e.preventDefault();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !readMeta().dirty)
      void syncNow();
  });
  return syncNow();
}

"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Plus, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { db, defaultSettings } from "@/lib/db";
import { type Doc, type Settings, driveId } from "@/lib/schema";
import { api, consent } from "@/lib/api";
import { Button } from "./ui/button";
export const labels = {
  past: "過去の実績",
  rules: "注意事項",
  current: "今回案件の資料",
};
export function Documents({
  ownerId,
  category,
  settings = defaultSettings,
  notify,
}: {
  ownerId: string;
  category: Doc["category"];
  settings?: Settings;
  notify: (s: string) => void;
}) {
  const docs =
    useLiveQuery(
      () =>
        db.documents
          .where("ownerId")
          .equals(ownerId)
          .filter((d) => d.category === category)
          .toArray(),
      [ownerId, category],
    ) || [];
  const [input, setInput] = useState(""),
    [busy, setBusy] = useState(""),
    [open, setOpen] = useState("");
  async function register() {
    setBusy("register");
    try {
      const id = driveId(input);
      const meta = await api<
        Pick<Doc, "id" | "name" | "modifiedTime" | "size" | "pageCount">
      >("/api/drive", { input: id });
      if (
        meta.size > settings.maxSizeMB * 1024 * 1024 ||
        meta.pageCount > settings.maxPages
      )
        throw new Error("設定のPDFサイズ・ページ数上限を超えています。");
      const old = (await db.documents.where("id").equals(id).toArray()).find(
        (d) =>
          d.modifiedTime === meta.modifiedTime && d.analysis && d.signature,
      );
      await db.documents.put({
        ...meta,
        ownerId,
        category,
        status: "registered",
        ...(old
          ? {
              analysis: old.analysis,
              signature: old.signature,
              analyzedAt: old.analyzedAt,
              status: "analyzed" as const,
            }
          : {}),
      });
      setInput("");
      notify(
        old
          ? "PDFを登録し、同じ更新日時の解析キャッシュを再利用しました。"
          : "PDFを登録しました。解析すると内容を利用できます。",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function analyze(d: Doc, force = false) {
    if (!consent()) return;
    setBusy(d.id);
    try {
      const meta = await api<Doc>("/api/drive", { input: d.id });
      if (
        !force &&
        d.modifiedTime === meta.modifiedTime &&
        d.analysis &&
        d.signature
      ) {
        notify("ファイルに変更がないため、保存済みの解析を利用します。");
        return;
      }
      const data = await api<Partial<Doc>>("/api/pdf/analyze", {
        id: d.id,
        model: settings.model,
        maxPages: settings.maxPages,
        maxSizeMB: settings.maxSizeMB,
        consent: true,
      });
      await db.documents.put({
        ...d,
        ...meta,
        ...data,
        ownerId,
        category,
        status: "analyzed",
        error: undefined,
      });
      notify("PDFの解析が完了しました。読み取り結果を確認してください。");
    } catch (e) {
      await db.documents.put({
        ...d,
        status: "error",
        error: (e as Error).message,
      });
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function localText(d: Doc) {
    setBusy(d.id);
    try {
      const response = await fetch("/api/pdf?id=" + encodeURIComponent(d.id));
      if (!response.ok)
        throw new Error(
          "PDFを取得できません。Google の接続を確認してください。",
        );
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const pdf = await pdfjs.getDocument({
        data: await response.arrayBuffer(),
      }).promise;
      const lines: string[] = [];
      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i),
            text = await page.getTextContent();
          lines.push(
            `【${i}ページ】\n` +
              text.items.map((t) => ("str" in t ? t.str : "")).join(" "),
          );
        }
      } finally {
        await pdf.destroy();
      }
      notify("PDF.jsのテキスト抽出が完了しました。");
      setOpen(d.id + ":local");
      setLocal(lines.join("\n\n"));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const [local, setLocal] = useState("");
  return (
    <section className="document-section">
      <div className="section-heading">
        <h3>
          <FileText size={17} />
          {labels[category]}PDF <span className="badge">{docs.length}</span>
        </h3>
        <span className="muted small">ファイルIDで管理</span>
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void register();
        }}
      >
        <input
          aria-label={`${labels[category]}のファイルIDまたは共有URL`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Google Drive のファイルID、または共有URL"
          required
        />
        <Button variant="outline" disabled={!!busy}>
          <Plus size={15} />
          登録
        </Button>
      </form>
      {docs.length === 0 && (
        <p className="empty-inline">
          PDFの共有URLを貼り付けて登録してください。フォルダの指定は不要です。
        </p>
      )}
      {docs.map((d) => (
        <article className="document" key={d.id}>
          <div className="document-top">
            <FileText size={21} />
            <div className="grow">
              <strong title={d.name}>{d.name}</strong>
              <div className="muted small">
                {d.pageCount}ページ · {(d.size / 1024 / 1024).toFixed(2)} MB ·
                更新 {new Date(d.modifiedTime).toLocaleString("ja-JP")} · 解析{" "}
                {d.analyzedAt
                  ? new Date(d.analyzedAt).toLocaleString("ja-JP")
                  : "—"}
              </div>
            </div>
            <span
              className={`badge ${d.status === "analyzed" ? "success" : ""}`}
            >
              {busy === d.id
                ? "解析・取得中…"
                : d.status === "analyzed"
                  ? "解析済み"
                  : d.status === "error"
                    ? "要再確認"
                    : "未解析"}
            </span>
          </div>
          {d.error && <p className="warning">{d.error}</p>}
          <div className="actions">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => analyze(d)}
            >
              <RefreshCw size={13} />
              解析・更新確認
            </Button>
            {d.analysis && (
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy}
                onClick={() => analyze(d, true)}
              >
                再解析
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen(open === d.id ? "" : d.id)}
            >
              解析結果
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={() => localText(d)}
            >
              PDF.jsで本文確認
            </Button>
            <a
              className="text-link small"
              href={`https://drive.google.com/file/d/${d.id}/view`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} />
              PDF
            </a>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`${d.name}の登録を削除`}
              onClick={async () => {
                if (
                  confirm(
                    "このPDFの登録と解析キャッシュを削除しますか？Driveの原本は残ります。",
                  )
                )
                  await db.documents.delete([
                    ownerId,
                    category,
                    d.id,
                  ] as unknown as string);
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
          {open === d.id && d.analysis && (
            <div className="analysis-preview">
              {d.analysis.warnings.map((w, i) => (
                <p className="warning" key={i}>
                  {w}
                </p>
              ))}
              {d.analysis.pages.map((p) => (
                <details key={p.page}>
                  <summary>
                    {p.page}ページ {p.uncertain ? "・読み取り要確認" : ""}
                  </summary>
                  <pre>{p.text}</pre>
                  {p.headings.length > 0 && (
                    <p>見出し：{p.headings.join(" / ")}</p>
                  )}
                  {p.fields.map((f, i) => (
                    <p key={i}>
                      <b>{f.name}</b>：{f.content}
                    </p>
                  ))}
                  {p.tables.map((t, i) => (
                    <pre key={i}>{t}</pre>
                  ))}
                  {p.figures.map((f, i) => (
                    <p key={i}>図表：{f}</p>
                  ))}
                </details>
              ))}
            </div>
          )}
          {open === d.id + ":local" && (
            <pre className="analysis-preview">
              {local ||
                "テキストがありません。スキャンPDFはGeminiで解析してください。"}
            </pre>
          )}
        </article>
      ))}
    </section>
  );
}

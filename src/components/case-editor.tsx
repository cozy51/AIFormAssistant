"use client";
import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  FileText,
  ChevronRight,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  type Case,
  type Settings,
  type Result,
  type Entry,
  addCandidate,
  count,
  now,
  uid,
  statsFor,
} from "@/lib/schema";
import { api, consent } from "@/lib/api";
import { Button } from "./ui/button";
import { Documents, labels } from "./documents";
const shortcuts = [
  "短くする",
  "詳しくする",
  "箇条書きにする",
  "技術文書らしくする",
  "過去実績に近づける",
  "注意事項を再確認する",
];
export function CaseEditor({
  project,
  settings,
  notify,
}: {
  project: Case;
  settings: Settings;
  notify: (s: string) => void;
}) {
  const [p, setP] = useState(project),
    ref = useRef(project),
    [active, setActive] = useState(project.template.items[0]?.id || ""),
    [busy, setBusy] = useState(""),
    [instruction, setInstruction] = useState<Record<string, string>>(
      Object.fromEntries(
        project.entries.map((e) => [e.itemId, e.additionalInstruction || ""]),
      ),
    ),
    [tab, setTab] = useState<"write" | "docs">("write");
  const docs =
    useLiveQuery(
      () => db.documents.where("ownerId").equals(project.id).toArray(),
      [project.id],
    ) || [];
  const item = p.template.items.find((i) => i.id === active),
    entry = p.entries.find((e) => e.itemId === active),
    selected = entry?.candidates.find(
      (c) => c.id === entry.selectedCandidateId,
    ),
    stats = item ? statsFor(p.template, item.id) : null;
  async function persist(next: Case) {
    ref.current = { ...next, updatedAt: now() };
    setP(ref.current);
    try {
      await db.cases.put(ref.current);
    } catch {
      notify(
        "案件を保存できません。ブラウザの空き容量を確認し、すぐバックアップを取得してください。",
      );
    }
  }
  async function changeEntry(id: string, fn: (e: Entry) => Entry) {
    const curr = ref.current,
      old = curr.entries.find((e) => e.itemId === id) || {
        itemId: id,
        text: "",
        confirmed: false,
        candidates: [],
        edits: [],
      };
    await persist({
      ...curr,
      entries: [...curr.entries.filter((e) => e.itemId !== id), fn(old)],
    });
  }
  async function generate(ids: string[], extra = "") {
    if (!consent()) return;
    setBusy("準備中");
    let completed = 0;
    try {
      if (docs.some((d) => d.status !== "analyzed"))
        throw new Error(
          "未解析または解析エラーのPDFがあります。案件情報・登録資料から解析を完了してください。",
        );
      for (const id of ids) {
        const i = ref.current.template.items.find((i) => i.id === id)!;
        setBusy(i.name);
        const result = await api<Result>("/api/generate", {
          template: ref.current.template,
          docs: docs.filter((d) => d.status === "analyzed"),
          itemId: id,
          instruction: [ref.current.instruction, instruction[id], extra]
            .filter(Boolean)
            .join("\n"),
          draftText:
            ref.current.entries.find((e) => e.itemId === id)?.text || "",
          model: settings.model,
          consent: true,
        });
        await changeEntry(id, (e) => addCandidate(e, result));
        completed++;
      }
      notify(
        `${completed}項目の候補を保存しました。内容を確認して「採用」してください。`,
      );
    } catch (e) {
      notify(`${completed}項目を保存済み。${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  }
  async function adopt(candidateId: string) {
    const c = entry?.candidates.find((c) => c.id === candidateId);
    if (!c) return;
    if (
      entry?.text &&
      !confirm("現在の編集文を履歴に保存し、この候補に置き換えますか？")
    )
      return;
    await changeEntry(active, (e) => ({
      ...e,
      text: c.result.generatedText,
      confirmed: false,
      selectedCandidateId: c.id,
      edits: [...e.edits, { id: uid(), text: e.text, at: now() }],
    }));
  }
  async function restore(text: string) {
    if (!confirm("現在の文章を履歴に保存し、選択した文章へ復元しますか？"))
      return;
    await changeEntry(active, (e) => ({
      ...e,
      text,
      confirmed: false,
      selectedCandidateId: undefined,
      edits: [...e.edits, { id: uid(), text: e.text, at: now() }],
    }));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DOCUMENT WORKSPACE</p>
          <h1>{p.name}</h1>
          <p className="muted">
            {p.template.name} <span className="separator">/</span>{" "}
            {p.entries.filter((e) => e.confirmed).length} /{" "}
            {p.template.items.length} 項目を確定
          </p>
        </div>
        <Button
          disabled={!!busy || !p.template.items.length}
          onClick={() => generate(p.template.items.map((i) => i.id))}
        >
          <Sparkles size={16} />
          {busy ? `${busy}を生成中…` : "全項目の候補を生成"}
        </Button>
      </div>
      <div className="tabs">
        <button
          className={tab === "write" ? "active" : ""}
          onClick={() => setTab("write")}
        >
          文章の作成・確認
        </button>
        <button
          className={tab === "docs" ? "active" : ""}
          onClick={() => setTab("docs")}
        >
          案件情報・登録資料 <span className="badge">{docs.length}</span>
        </button>
        <span className="autosave">端末内に自動保存</span>
      </div>
      {tab === "docs" ? (
        <>
          <div className="panel field-stack">
            <label>
              案件名
              <input
                value={p.name}
                onChange={(e) =>
                  persist({ ...ref.current, name: e.target.value })
                }
              />
            </label>
            <label>
              今回案件の追加指示
              <textarea
                value={p.instruction}
                onChange={(e) =>
                  persist({ ...ref.current, instruction: e.target.value })
                }
              />
            </label>
            <p className="small muted">
              この案件は作成時の項目・ルールを保持します。テンプレートの変更は既存案件には反映されません。
            </p>
          </div>
          <Documents
            ownerId={p.id}
            category="current"
            settings={settings}
            notify={notify}
          />
          <details className="panel">
            <summary>引き継いだ過去実績・注意事項</summary>
            <Documents
              ownerId={p.id}
              category="past"
              settings={settings}
              notify={notify}
            />
            <Documents
              ownerId={p.id}
              category="rules"
              settings={settings}
              notify={notify}
            />
          </details>
        </>
      ) : (
        <div className="writing-layout">
          <aside className="item-navigation">
            <div className="nav-caption">帳票の項目</div>
            {p.template.items.map((i, index) => {
              const e = p.entries.find((e) => e.itemId === i.id);
              return (
                <button
                  key={i.id}
                  className={active === i.id ? "selected" : ""}
                  onClick={() => setActive(i.id)}
                >
                  <span className={`item-state ${e?.confirmed ? "done" : ""}`}>
                    {e?.confirmed ? (
                      <Check size={13} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <div>
                    {i.name}
                    <small>
                      {e?.confirmed
                        ? "確定済み"
                        : e?.text
                          ? "編集中"
                          : e?.candidates.length
                            ? "候補を確認"
                            : "未生成"}
                    </small>
                  </div>
                  <ChevronRight size={14} />
                </button>
              );
            })}
            <p className="small muted">
              項目ごとに根拠を確認し、編集・確定できます。
            </p>
          </aside>
          {item ? (
            <div className="writing-main">
              <section className="panel item-context">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      ITEM{" "}
                      {String(p.template.items.indexOf(item) + 1).padStart(
                        2,
                        "0",
                      )}
                    </span>
                    <h2>{item.name}</h2>
                  </div>
                  <span className="badge">目標 {item.target}字</span>
                </div>
                {item.description && (
                  <p className="muted">{item.description}</p>
                )}
                <div className="context-grid">
                  <details>
                    <summary>
                      過去実績の記入例 <span className="badge">文体の参考</span>
                    </summary>
                    {stats && (
                      <p>
                        平均 {stats.average}字 / 最小 {stats.min}字 / 最大{" "}
                        {stats.max}字
                      </p>
                    )}
                    {[
                      ...item.examples,
                      ...p.template.stats
                        .filter((s) => s.itemId === item.id)
                        .map((s) => s.content),
                    ].map((s, i) => (
                      <p className="prewrap" key={i}>
                        {s}
                      </p>
                    ))}
                    {!stats && !item.examples.length && (
                      <p className="muted">登録されていません。</p>
                    )}
                  </details>
                  <details>
                    <summary>記入ルール・注意事項</summary>
                    <p className="prewrap">
                      {item.rules || "項目固有のルールは未登録です。"}
                    </p>
                    {p.template.rules
                      .filter((r) => !r.itemId || r.itemId === item.id)
                      .map((r) => (
                        <p
                          key={r.id}
                          className={r.conflict && !r.resolved ? "warning" : ""}
                        >
                          {r.text}
                          {r.conflict && !r.resolved ? "【競合・要解決】" : ""}
                        </p>
                      ))}
                  </details>
                </div>
                <details>
                  <summary>今回案件の関連情報</summary>
                  {docs
                    .filter((d) => d.category === "current")
                    .map((d) => (
                      <div key={d.id}>
                        <b>{d.name}</b>
                        {d.analysis?.pages.map((page) => (
                          <details key={page.page}>
                            <summary>
                              {page.page}ページ{" "}
                              {page.uncertain ? "・読み取り要確認" : ""}
                            </summary>
                            <p className="prewrap">{page.text}</p>
                            {page.fields.map((f, i) => (
                              <p key={i}>
                                <b>{f.name}</b>：{f.content}
                              </p>
                            ))}
                          </details>
                        ))}
                      </div>
                    ))}
                </details>
              </section>
              <section className="panel editor-panel">
                <div className="section-heading">
                  <h2>帳票へ記入する文章</h2>
                  <span
                    className={`badge ${entry?.confirmed ? "success" : ""}`}
                  >
                    {entry?.confirmed ? "確定済み" : "未確定"}
                  </span>
                </div>
                <textarea
                  className="main-editor"
                  aria-label="生成文章の編集"
                  placeholder="候補を生成して採用すると、ここで文章を編集できます。直接入力も可能です。"
                  value={entry?.text || ""}
                  onFocus={() => {
                    if (entry?.text && entry.edits.at(-1)?.text !== entry.text)
                      void changeEntry(active, (e) => ({
                        ...e,
                        edits: [
                          ...e.edits,
                          { id: uid(), text: e.text, at: now() },
                        ],
                      }));
                  }}
                  onChange={(e) =>
                    changeEntry(active, (v) => ({
                      ...v,
                      text: e.target.value,
                      confirmed: false,
                    }))
                  }
                />
                <div className="editor-footer">
                  <span
                    className={
                      count(entry?.text || "") > item.target
                        ? "warning small"
                        : "muted small"
                    }
                  >
                    <strong>{count(entry?.text || "")}</strong> / 目標{" "}
                    {item.target}字
                  </span>
                  <div className="actions">
                    <Button
                      variant="outline"
                      disabled={!entry?.text}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(entry!.text);
                          notify("文章をコピーしました。");
                        } catch {
                          notify(
                            "コピーできません。文章を選択して手動でコピーしてください。",
                          );
                        }
                      }}
                    >
                      <Copy size={14} />
                      コピー
                    </Button>
                    <Button
                      disabled={!entry?.text}
                      variant={entry?.confirmed ? "outline" : "default"}
                      onClick={() =>
                        changeEntry(active, (e) => ({
                          ...e,
                          confirmed: !e.confirmed,
                        }))
                      }
                    >
                      <Check size={15} />
                      {entry?.confirmed ? "確定を解除" : "この文章を確定"}
                    </Button>
                  </div>
                </div>
                <p className="small muted">
                  編集内容は自動保存されます。再生成しても、この文章は上書きされません。
                </p>
                {selected && (
                  <div className="source-list">
                    <h3>採用候補の参照元</h3>
                    <p className="small muted">
                      手動編集後の文章は、参照元との対応を再確認してください。
                    </p>
                    <References result={selected.result} />
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>
                    <Sparkles size={17} />
                    AIの文章候補
                  </h2>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => generate([active])}
                  >
                    {busy
                      ? "生成中…"
                      : entry?.candidates.length
                        ? "新しい候補を生成"
                        : "この項目を生成"}
                  </Button>
                </div>
                <label>
                  追加指示
                  <textarea
                    value={instruction[active] || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setInstruction({ ...instruction, [active]: value });
                      void changeEntry(active, (entry) => ({
                        ...entry,
                        additionalInstruction: value,
                      }));
                    }}
                    placeholder="例：変更の理由を先に記載してください"
                  />
                </label>
                <div className="shortcuts">
                  {shortcuts.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => generate([active], s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                <p className="small muted">
                  資料の内容をGeminiに送信します。候補は確認してから採用してください。
                </p>
                {[...(entry?.candidates || [])].reverse().map((c, index) => (
                  <article className="candidate" key={c.id}>
                    <div className="section-heading">
                      <b>候補 {entry!.candidates.length - index}</b>
                      <span className="muted small">
                        {new Date(c.createdAt).toLocaleString("ja-JP")} ·{" "}
                        {count(c.result.generatedText)}字 · 確信度{" "}
                        {Math.round(c.result.confidence * 100)}%
                      </span>
                    </div>
                    <p className="prewrap">{c.result.generatedText}</p>
                    <References result={c.result} />
                    <Button
                      size="sm"
                      variant={
                        entry?.selectedCandidateId === c.id
                          ? "outline"
                          : "default"
                      }
                      onClick={() => adopt(c.id)}
                    >
                      {entry?.selectedCandidateId === c.id
                        ? "採用済み・再適用"
                        : "この候補を採用"}
                    </Button>
                  </article>
                ))}
              </section>
              <details className="panel">
                <summary>
                  <RotateCcw size={15} />
                  編集履歴・復元（{entry?.edits.length || 0}件）
                </summary>
                {[...(entry?.edits || [])].reverse().map((e) => (
                  <div className="candidate" key={e.id}>
                    <span className="muted small">
                      {new Date(e.at).toLocaleString("ja-JP")}
                    </span>
                    <p className="prewrap">{e.text || "（空の文章）"}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restore(e.text)}
                    >
                      この文章へ復元
                    </Button>
                  </div>
                ))}
              </details>
            </div>
          ) : (
            <div className="panel">
              項目がありません。項目のあるテンプレートから案件を作成してください。
            </div>
          )}
        </div>
      )}
    </>
  );
}
function References({ result }: { result: Result }) {
  return (
    <>
      <div className="alerts">
        {result.missingInformation.map((m, i) => (
          <p className="warning" key={"m" + i}>
            要確認：{m}
          </p>
        ))}
        {result.warnings.map((w, i) => (
          <p className="warning" key={"w" + i}>
            {w}
          </p>
        ))}
      </div>
      {result.references.length > 0 && (
        <details className="references">
          <summary>
            <FileText size={14} />
            参照元を確認（{result.references.length}件）
          </summary>
          {result.references.map((r, i) => (
            <div key={i}>
              <span className="badge">{labels[r.category]}</span>{" "}
              <a
                className="text-link"
                target="_blank"
                rel="noreferrer"
                href={`/api/pdf?id=${encodeURIComponent(r.fileId)}#page=${r.page}`}
              >
                {r.fileName} / {r.page}ページ ↗
              </a>
              <blockquote>{r.quote}</blockquote>
            </div>
          ))}
        </details>
      )}
    </>
  );
}

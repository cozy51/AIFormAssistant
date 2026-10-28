"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Sparkles,
  Save,
  Copy,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  type Template,
  type Settings,
  type Item,
  ItemSchema,
  uid,
  now,
  statsFor,
} from "@/lib/schema";
import { api, consent } from "@/lib/api";
import { Button } from "./ui/button";
import { Documents } from "./documents";
export function TemplateEditor({
  template,
  settings,
  notify,
}: {
  template: Template;
  settings: Settings;
  notify: (s: string) => void;
}) {
  const [draft, setDraft] = useState(template),
    [busy, setBusy] = useState(false),
    [proposal, setProposal] = useState<
      | (Pick<Template, "items" | "stats" | "rules"> & { warnings: string[] })
      | null
    >(null);
  const docs =
    useLiveQuery(
      () => db.documents.where("ownerId").equals(template.id).toArray(),
      [template.id],
    ) || [];
  function update(next: Template) {
    setDraft({ ...next, updatedAt: now() });
  }
  function item(i: number, p: Partial<Item>) {
    update({
      ...draft,
      items: draft.items.map((v, j) => (j === i ? { ...v, ...p } : v)),
    });
  }
  async function save() {
    try {
      for (const i of draft.items) ItemSchema.parse(i);
      if (!draft.name.trim())
        throw new Error("テンプレート名を入力してください。");
      await db.templates.put({
        ...draft,
        items: draft.items.map((v, i) => ({ ...v, order: i })),
        updatedAt: now(),
      });
      notify("テンプレートを保存しました。");
    } catch (e) {
      notify(
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "項目名と目標文字数（1〜20,000字）を確認してください。",
      );
    }
  }
  async function analyze() {
    if (!consent()) return;
    setBusy(true);
    try {
      if (docs.some((d) => d.status !== "analyzed"))
        throw new Error("登録PDFをすべて解析してから実行してください。");
      const result = await api<
        Pick<Template, "items" | "stats" | "rules"> & { warnings: string[] }
      >("/api/analyze", {
        docs,
        items: draft.items,
        model: settings.model,
        consent: true,
      });
      setProposal({
        ...result,
        stats: result.stats.map((s) => ({ ...s, confirmed: false })),
        rules: result.rules.map((r) => ({
          ...r,
          reviewed: false,
          resolved: false,
        })),
      });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, delta: number) {
    const items = [...draft.items];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    update({ ...draft, items: items.map((i, n) => ({ ...i, order: n })) });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TEMPLATE WORKSPACE</p>
          <h1>テンプレートを整える</h1>
          <p className="muted">
            実績の書き方と記入ルールを、帳票ごとにまとめます。
          </p>
        </div>
        <div className="actions">
          <Button
            variant="outline"
            onClick={async () => {
              await db.templates.put({
                ...draft,
                id: uid(),
                name: draft.name + "（複製）",
                updatedAt: now(),
              });
              notify(
                "テンプレート定義を複製しました。PDFは複製先で登録してください。",
              );
            }}
          >
            <Copy size={16} />
            複製
          </Button>
          <Button onClick={save}>
            <Save size={16} />
            保存
          </Button>
        </div>
      </div>
      <div className="panel">
        <label>
          テンプレート名
          <input
            value={draft.name}
            onChange={(e) => update({ ...draft, name: e.target.value })}
          />
        </label>
      </div>
      <div className="two-column">
        <div>
          <Documents
            ownerId={draft.id}
            category="past"
            settings={settings}
            notify={notify}
          />
          <Documents
            ownerId={draft.id}
            category="rules"
            settings={settings}
            notify={notify}
          />
        </div>
        <div className="panel">
          <div className="section-heading">
            <h2>帳票項目</h2>
            <Button variant="outline" disabled={busy} onClick={analyze}>
              <Sparkles size={15} />
              {busy ? "分析中…" : "PDFから項目・ルールを抽出"}
            </Button>
          </div>
          <p className="small muted">
            抽出結果は確認して取り込み、保存してください。実績の数値は新しい案件へ流用しません。
          </p>
          {proposal && (
            <div className="proposal">
              <h3>抽出結果の確認</h3>
              {proposal.warnings.map((w, i) => (
                <p key={i} className="warning">
                  {w}
                </p>
              ))}
              <p>
                {proposal.items.length}項目 · 実績{proposal.stats.length}件 ·
                ルール{proposal.rules.length}件
              </p>
              <ul>
                {proposal.items.map((i) => (
                  <li key={i.id}>
                    {i.name} — {i.target}字 / {i.description}
                  </li>
                ))}
              </ul>
              <details>
                <summary>実績・ルールの詳細</summary>
                <pre>
                  {JSON.stringify(
                    { stats: proposal.stats, rules: proposal.rules },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <div className="actions">
                <Button
                  onClick={() => {
                    update({ ...draft, ...proposal });
                    setProposal(null);
                    notify(
                      "編集欄に取り込みました。項目・対応・競合を確認して保存してください。",
                    );
                  }}
                >
                  編集欄に取り込む
                </Button>
                <Button variant="ghost" onClick={() => setProposal(null)}>
                  取り消す
                </Button>
              </div>
            </div>
          )}
          {draft.items.map((v, i) => (
            <details className="item-definition" key={v.id} open={undefined}>
              <summary>
                <span className="number">{i + 1}</span>
                {v.name || "項目名を入力"}
                <span className="muted small">{v.target}字</span>
              </summary>
              <div className="field-stack">
                <label>
                  項目名
                  <input
                    value={v.name}
                    onChange={(e) => item(i, { name: e.target.value })}
                  />
                </label>
                <span className="small muted">項目ID：{v.id}</span>
                <label>
                  説明
                  <textarea
                    value={v.description}
                    onChange={(e) => item(i, { description: e.target.value })}
                  />
                </label>
                <label>
                  記入ルール
                  <textarea
                    value={v.rules}
                    onChange={(e) => item(i, { rules: e.target.value })}
                  />
                </label>
                <label>
                  目標文字数
                  <input
                    type="number"
                    min="1"
                    max="20000"
                    value={v.target}
                    onChange={(e) =>
                      item(i, { target: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  過去実績の参考文章（空行で区切る）
                  <textarea
                    value={v.examples.join("\n\n")}
                    onChange={(e) =>
                      item(i, { examples: e.target.value.split("\n\n") })
                    }
                  />
                </label>
                <label>
                  AIへの追加指示
                  <textarea
                    value={v.instruction}
                    onChange={(e) => item(i, { instruction: e.target.value })}
                  />
                </label>
                <div className="actions">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={13} />
                    上へ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={i === draft.items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={13} />
                    下へ
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (
                        confirm(
                          "項目と関連する分析結果・ルールの紐付けを削除しますか？",
                        )
                      )
                        update({
                          ...draft,
                          items: draft.items.filter((x) => x.id !== v.id),
                          stats: draft.stats.map((s) =>
                            s.itemId === v.id ? { ...s, itemId: "" } : s,
                          ),
                          rules: draft.rules.map((r) =>
                            r.itemId === v.id ? { ...r, itemId: "" } : r,
                          ),
                        });
                    }}
                  >
                    <Trash2 size={13} />
                    削除
                  </Button>
                </div>
              </div>
            </details>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              update({
                ...draft,
                items: [
                  ...draft.items,
                  {
                    id: uid(),
                    name: "新しい項目",
                    order: draft.items.length,
                    description: "",
                    rules: "",
                    target: settings.defaultTarget,
                    examples: [],
                    instruction: "",
                  },
                ],
              })
            }
          >
            <Plus size={15} />
            項目を追加
          </Button>
        </div>
      </div>
      <section className="panel">
        <h2>過去実績の分析・項目対応</h2>
        {!draft.stats.length && (
          <p className="muted">
            PDFの項目抽出後に、文章量と書き方の分析結果を表示します。
          </p>
        )}
        {draft.items.map((i) => {
          const stats = statsFor(draft, i.id);
          return (
            stats && (
              <div className="stat-line" key={i.id}>
                <b>{i.name}</b>
                <span>平均 {stats.average}字</span>
                <span>
                  最小 {stats.min}字 / 最大 {stats.max}字
                </span>
                <span>{stats.count}件</span>
              </div>
            )
          );
        })}
        {draft.stats.map((s, index) => (
          <details key={index} className="mapping">
            <summary>
              {s.sourceName}{" "}
              <span className="badge">
                対応確信度 {Math.round(s.confidence * 100)}%
              </span>
            </summary>
            <label>
              対応する帳票項目
              <select
                value={s.itemId}
                onChange={(e) =>
                  update({
                    ...draft,
                    stats: draft.stats.map((v, n) =>
                      n === index ? { ...v, itemId: e.target.value } : v,
                    ),
                  })
                }
              >
                <option value="">未対応・要確認</option>
                {draft.items.map((i) => (
                  <option value={i.id} key={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={s.confirmed}
                onChange={(e) =>
                  update({
                    ...draft,
                    stats: draft.stats.map((v, n) =>
                      n === index ? { ...v, confirmed: e.target.checked } : v,
                    ),
                  })
                }
              />
              項目の対応を確認した
            </label>
            <p className="prewrap">{s.content}</p>
            <p>
              構成：{s.structure} / 記載粒度：{s.granularity}
            </p>
            <p>
              表現：{s.expressions.join("、")} / 専門用語：{s.terms.join("、")}
            </p>
            <p>箇条書き：{s.bulletTrend}</p>
            <a
              className="text-link"
              target="_blank"
              rel="noreferrer"
              href={`/api/pdf?id=${s.fileId}#page=${s.page}`}
            >
              元PDF {s.page}ページ
            </a>
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>注意事項・ルールの対応と競合</h2>
        {!draft.rules.length && (
          <p className="muted">
            注意事項PDFを解析すると、適用するルールが表示されます。
          </p>
        )}
        {draft.rules.map((r, index) => (
          <div className="rule-card" key={r.id}>
            <div className="actions">
              <span className="badge">
                {
                  {
                    common: "共通",
                    required: "必須",
                    prohibited: "禁止",
                    example: "例文",
                    length: "文字数",
                    technical: "技術注意",
                  }[r.kind]
                }
              </span>
              <a
                className="text-link small"
                target="_blank"
                rel="noreferrer"
                href={`/api/pdf?id=${r.fileId}#page=${r.page}`}
              >
                元PDF {r.page}ページ
              </a>
            </div>
            <textarea
              aria-label="ルール本文"
              value={r.text}
              onChange={(e) =>
                update({
                  ...draft,
                  rules: draft.rules.map((v, n) =>
                    n === index ? { ...v, text: e.target.value } : v,
                  ),
                })
              }
            />
            <label>
              適用先
              <select
                value={r.itemId}
                onChange={(e) =>
                  update({
                    ...draft,
                    rules: draft.rules.map((v, n) =>
                      n === index ? { ...v, itemId: e.target.value } : v,
                    ),
                  })
                }
              >
                <option value="">帳票全体</option>
                {draft.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={r.reviewed}
                onChange={(e) =>
                  update({
                    ...draft,
                    rules: draft.rules.map((v, n) =>
                      n === index ? { ...v, reviewed: e.target.checked } : v,
                    ),
                  })
                }
              />
              ルールの内容と適用先を確認した
            </label>
            {r.conflict && (
              <>
                <p className="warning">競合：{r.conflict}</p>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={r.resolved}
                    onChange={(e) =>
                      update({
                        ...draft,
                        rules: draft.rules.map((v, n) =>
                          n === index
                            ? { ...v, resolved: e.target.checked }
                            : v,
                        ),
                      })
                    }
                  />
                  関係するルールを修正・確認し、競合を解消した
                </label>
              </>
            )}
          </div>
        ))}
      </section>
      <div className="sticky-save">
        <span className="muted small">
          編集後は保存してください。既存案件は作成時のテンプレートを保持します。
        </span>
        <Button onClick={save}>
          <Save size={16} />
          テンプレートを保存
        </Button>
      </div>
    </>
  );
}

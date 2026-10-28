"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useLiveQuery } from "dexie-react-hooks";
import {
  LayoutDashboard,
  Files,
  FolderOpen,
  Settings as SettingsIcon,
  Plus,
  ArrowUpRight,
  FileText,
  ChevronRight,
  Sun,
  Moon,
  CheckCircle2,
  ShieldCheck,
  PanelLeftClose,
  Menu,
  Trash2,
} from "lucide-react";
import { db, defaultSettings, removeTemplate, removeCase } from "@/lib/db";
import { uid, now, type Template, type Case } from "@/lib/schema";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { TemplateEditor } from "./template-editor";
import { CaseEditor } from "./case-editor";
import { SettingsView, type Connection } from "./settings";
type View = "dashboard" | "templates" | "cases" | "settings";
export function Workspace() {
  const templates =
      useLiveQuery(() =>
        db.templates.orderBy("updatedAt").reverse().toArray(),
      ) || [],
    cases =
      useLiveQuery(() => db.cases.orderBy("updatedAt").reverse().toArray()) ||
      [],
    settings = useLiveQuery(() => db.settings.get("main")) || defaultSettings;
  const [view, setView] = useState<View>("dashboard"),
    [templateId, setTemplateId] = useState(""),
    [caseId, setCaseId] = useState(""),
    [connection, setConnection] = useState<Connection>({
      authenticated: false,
      geminiConfigured: false,
      googleConfigured: false,
      model: "gemini-2.5-flash",
    }),
    [message, setMessage] = useState(""),
    [modal, setModal] = useState<"case" | "template" | null>(null),
    [name, setName] = useState(""),
    [choice, setChoice] = useState(""),
    [navOpen, setNavOpen] = useState(false),
    [fatal, setFatal] = useState("");
  const template = templates.find((t) => t.id === templateId),
    project = cases.find((c) => c.id === caseId);
  async function refresh() {
    try {
      const c = await api<Connection>("/api/session");
      setConnection(c);
      if (!(await db.settings.get("main")))
        await db.settings.put({ ...defaultSettings, model: c.model });
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    const bootstrap = async () => {
      await refresh();
      const error = new URLSearchParams(location.search).get("authError");
      if (error) {
        setMessage(error);
        history.replaceState(null, "", location.pathname);
      }
    };
    void bootstrap();
    db.open().catch(() =>
      setFatal(
        "ブラウザの保存領域を開けません。プライベートモードやストレージの設定を確認してください。",
      ),
    );
    const onError = (e: PromiseRejectionEvent) => {
      if (
        e.reason?.name?.includes("Quota") ||
        e.reason?.name?.includes("Database") ||
        e.reason?.name?.includes("IndexedDB")
      ) {
        setFatal(
          "端末への保存に失敗しました。空き容量と保存許可を確認してください。",
        );
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onError);
    return () => window.removeEventListener("unhandledrejection", onError);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.dark);
  }, [settings.dark]);
  function navigate(v: View) {
    setView(v);
    setTemplateId("");
    setCaseId("");
    setNavOpen(false);
  }
  function openCase(c: Case) {
    setView("cases");
    setCaseId(c.id);
    setNavOpen(false);
  }
  function openTemplate(t: Template) {
    setView("templates");
    setTemplateId(t.id);
    setNavOpen(false);
  }
  async function create() {
    try {
      if (!name.trim()) throw new Error("名前を入力してください。");
      if (modal === "template") {
        const t: Template = {
          id: uid(),
          name: name.trim(),
          items: [],
          stats: [],
          rules: [],
          updatedAt: now(),
        };
        await db.templates.put(t);
        openTemplate(t);
      } else {
        const t = templates.find((t) => t.id === choice);
        if (!t?.items.length)
          throw new Error(
            "項目を登録・保存したテンプレートを選択してください。",
          );
        const c: Case = {
          id: uid(),
          name: name.trim(),
          templateId: t.id,
          template: structuredClone(t),
          instruction: "",
          createdAt: now(),
          updatedAt: now(),
          entries: [],
        };
        await db.transaction("rw", db.cases, db.documents, async () => {
          await db.cases.put(c);
          const docs = await db.documents
            .where("ownerId")
            .equals(t.id)
            .toArray();
          for (const d of docs) await db.documents.put({ ...d, ownerId: c.id });
        });
        openCase(c);
      }
      setModal(null);
      setName("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function newModal(kind: "case" | "template") {
    setName("");
    setChoice(templates.find((t) => t.items.length)?.id || "");
    setModal(kind);
  }
  const nav = [
    {
      id: "dashboard" as const,
      label: "ダッシュボード",
      icon: LayoutDashboard,
    },
    { id: "templates" as const, label: "帳票テンプレート", icon: Files },
    { id: "cases" as const, label: "案件・作成履歴", icon: FolderOpen },
    { id: "settings" as const, label: "設定", icon: SettingsIcon },
  ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${navOpen ? "mobile-open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-icon" aria-hidden="true">
            <Image
              src="/brand/icon.png"
              alt=""
              width={41}
              height={41}
              priority
            />
          </span>
          <div>
            AI帳票<span>ASSISTANT</span>
          </div>
        </a>
        <div className="workspace-label">
          ワークスペース <span>個人用</span>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "templates" && <small>{templates.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={20} />
          <b>データはこの端末に保存</b>
          <p>
            案件と文章はブラウザ内で管理。定期的なバックアップをおすすめします。
          </p>
          <button onClick={() => navigate("settings")}>
            バックアップ設定 <ArrowUpRight size={13} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">
            {connection.email?.slice(0, 1).toUpperCase() || "U"}
          </span>
          <div>
            <b>{connection.email?.split("@")[0] || "ワークスペース"}</b>
            <small>
              {connection.authenticated ? "Google 接続済み" : "Google 未接続"}
            </small>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="メニューを閉じる"
            onClick={() => setNavOpen(false)}
          >
            <PanelLeftClose size={16} />
          </Button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="メニューを開く"
              onClick={() => setNavOpen(!navOpen)}
            >
              <Menu size={20} />
            </button>
            <span>ワークスペース</span>
            <ChevronRight size={13} />
            <b>{nav.find((n) => n.id === view)?.label}</b>
          </div>
          <div className="actions">
            <span className="top-status">
              <i className={connection.authenticated ? "connected" : ""} />
              Google Drive {connection.authenticated ? "接続済み" : "未接続"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="表示モードを切り替え"
              onClick={async () => {
                try {
                  await db.settings.put({ ...settings, dark: !settings.dark });
                } catch {
                  setMessage("表示設定を保存できませんでした。");
                }
              }}
            >
              {settings.dark ? <Sun size={17} /> : <Moon size={17} />}
            </Button>
          </div>
        </header>
        <main>
          {fatal && (
            <div className="warning" role="alert">
              {fatal}
            </div>
          )}
          {view === "dashboard" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">YOUR DOCUMENT WORKSPACE</p>
                  <h1>資料を根拠に、伝わる帳票へ。</h1>
                  <p className="muted">
                    実績とルールを参照して、技術文書の作成をサポートします。
                  </p>
                </div>
                <Button onClick={() => newModal("case")}>
                  <Plus size={17} />
                  新しい案件を作成
                </Button>
              </div>
              <section className="welcome-banner">
                <div>
                  <span className="banner-kicker">
                    <span className="spark-dot" /> AI帳票アシスタント
                  </span>
                  <h2>
                    書き方は実績から。
                    <br />
                    事実は今回の資料から。
                  </h2>
                  <p>
                    Google Drive のPDFをつなげて、項目ごとに文章を作成。
                    <br />
                    根拠を確認しながら、あなたの言葉で仕上げられます。
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => newModal("template")}
                  >
                    帳票テンプレートを登録 <ArrowUpRight size={15} />
                  </Button>
                </div>
                <div className="banner-illustration" aria-hidden="true">
                  <div className="paper-back" />
                  <div className="paper">
                    <span className="paper-heading">
                      <FileText size={18} />
                      技術文書
                    </span>
                    <i />
                    <i />
                    <i className="short" />
                    <span className="paper-highlight">
                      <CheckCircle2 size={15} />
                      資料の根拠を確認
                    </span>
                    <i />
                    <i className="short" />
                  </div>
                  <span className="floating-tag">
                    <ShieldCheck size={14} />
                    確かな文書づくり
                  </span>
                </div>
              </section>
              <div className="metrics">
                <div>
                  <span>帳票テンプレート</span>
                  <b>
                    {templates.length}
                    <small>種類</small>
                  </b>
                  <Files size={21} />
                </div>
                <div>
                  <span>保存された案件</span>
                  <b>
                    {cases.length}
                    <small>件</small>
                  </b>
                  <FolderOpen size={21} />
                </div>
                <div>
                  <span>確定した項目</span>
                  <b>
                    {cases.reduce(
                      (s, c) => s + c.entries.filter((e) => e.confirmed).length,
                      0,
                    )}
                    <small>項目</small>
                  </b>
                  <CheckCircle2 size={21} />
                </div>
              </div>
              <div className="section-heading">
                <div>
                  <h2>帳票テンプレート</h2>
                  <p className="muted small">よく使う帳票の項目と記入ルール</p>
                </div>
                <Button variant="ghost" onClick={() => navigate("templates")}>
                  すべて見る <ChevronRight size={14} />
                </Button>
              </div>
              <TemplateCards
                templates={templates.slice(0, 3)}
                open={openTemplate}
                create={() => newModal("template")}
              />
              <section className="panel recent-panel">
                <div className="section-heading">
                  <h2>最近の案件</h2>
                  <Button variant="ghost" onClick={() => navigate("cases")}>
                    履歴を見る <ChevronRight size={14} />
                  </Button>
                </div>
                <CaseList
                  cases={cases.slice(0, 5)}
                  open={openCase}
                  empty={() => newModal("case")}
                />
              </section>
              <div className="connection-grid">
                <button onClick={() => navigate("settings")}>
                  <span className="connection-icon">G</span>
                  <div>
                    <b>Google Drive</b>
                    <small>
                      {connection.authenticated
                        ? "PDFにアクセスできます"
                        : "接続して資料を登録しましょう"}
                    </small>
                  </div>
                  <span
                    className={`badge ${connection.authenticated ? "success" : ""}`}
                  >
                    {connection.authenticated ? "接続済み" : "接続設定"}
                  </span>
                </button>
                <button onClick={() => navigate("settings")}>
                  <span className="connection-icon gemini">✦</span>
                  <div>
                    <b>Google Gemini</b>
                    <small>{settings.model}</small>
                  </div>
                  <span
                    className={`badge ${connection.geminiConfigured ? "success" : ""}`}
                  >
                    {connection.geminiConfigured ? "キー設定済み" : "未設定"}
                  </span>
                </button>
              </div>
              <p className="footnote">
                <ShieldCheck size={13} />
                資料内容のAI送信は、解析・生成操作の前に確認します。
              </p>
            </>
          )}
          {view === "templates" &&
            (template ? (
              <TemplateEditor
                key={template.id}
                template={template}
                settings={settings}
                notify={setMessage}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">TEMPLATES</p>
                    <h1>帳票テンプレート</h1>
                    <p className="muted">
                      帳票の項目・過去実績・注意事項を管理します。
                    </p>
                  </div>
                  <Button onClick={() => newModal("template")}>
                    <Plus size={16} />
                    新規テンプレート
                  </Button>
                </div>
                <TemplateCards
                  templates={templates}
                  open={openTemplate}
                  create={() => newModal("template")}
                />
                {templates.map((t) => (
                  <div className="delete-row" key={t.id}>
                    <span>{t.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (
                          confirm(
                            "テンプレートと登録PDFを削除しますか？既存案件の保存内容は残ります。",
                          )
                        )
                          try {
                            await removeTemplate(t.id);
                          } catch {
                            setMessage("削除できませんでした。");
                          }
                      }}
                    >
                      <Trash2 size={14} />
                      削除
                    </Button>
                  </div>
                ))}
              </>
            ))}
          {view === "cases" &&
            (project ? (
              <CaseEditor
                key={project.id}
                project={project}
                settings={settings}
                notify={setMessage}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">PROJECT HISTORY</p>
                    <h1>案件・作成履歴</h1>
                    <p className="muted">
                      過去の案件を開いて、文章の作成を続けられます。
                    </p>
                  </div>
                  <Button onClick={() => newModal("case")}>
                    <Plus size={16} />
                    新しい案件
                  </Button>
                </div>
                <section className="panel">
                  <CaseList
                    cases={cases}
                    open={openCase}
                    empty={() => newModal("case")}
                  />
                </section>
                {cases.map((c) => (
                  <div className="delete-row" key={c.id}>
                    <span>{c.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (
                          confirm(
                            "案件・生成履歴・編集履歴・登録PDFを削除しますか？",
                          )
                        )
                          try {
                            await removeCase(c.id);
                          } catch {
                            setMessage("削除できませんでした。");
                          }
                      }}
                    >
                      <Trash2 size={14} />
                      削除
                    </Button>
                  </div>
                ))}
              </>
            ))}
          {view === "settings" && (
            <SettingsView
              key={settings.id}
              settings={settings}
              connection={connection}
              notify={setMessage}
              refresh={refresh}
            />
          )}
        </main>
        <footer>
          AI帳票アシスタント{" "}
          <span>資料を読み解く。その先の、ものづくりへ。</span>
        </footer>
      </div>
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label="通知を閉じる" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setModal(null);
            }}
          >
            <h2 id="dialog-title">
              {modal === "template"
                ? "帳票テンプレートの新規作成"
                : "新しい案件を作成"}
            </h2>
            <form
              className="field-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label>
                {modal === "template" ? "テンプレート名" : "案件名"}
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder={
                    modal === "template"
                      ? "例：設計変更申請書"
                      : "例：制御盤ブラケットの設計変更"
                  }
                />
              </label>
              {modal === "case" && (
                <label>
                  使用するテンプレート
                  <select
                    value={choice}
                    onChange={(e) => setChoice(e.target.value)}
                    required
                  >
                    <option value="">選択してください</option>
                    {templates
                      .filter((t) => t.items.length)
                      .map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  {!templates.some((t) => t.items.length) && (
                    <span className="warning small">
                      先にテンプレートを作成し、項目を登録・保存してください。
                    </span>
                  )}
                </label>
              )}
              <div className="actions end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setModal(null)}
                >
                  キャンセル
                </Button>
                <Button type="submit">作成する</Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function TemplateCards({
  templates,
  open,
  create,
}: {
  templates: Template[];
  open: (t: Template) => void;
  create: () => void;
}) {
  return (
    <div className="template-grid">
      {templates.map((t, i) => (
        <button className="template-card" onClick={() => open(t)} key={t.id}>
          <span className={`template-icon tone-${i % 3}`}>
            <FileText size={23} />
          </span>
          <ArrowUpRight size={17} className="card-arrow" />
          <h3>{t.name}</h3>
          <p>
            {t.items.length}項目 <span>·</span> {t.rules.length}件の記入ルール
          </p>
          <div className="card-bottom">
            更新 {new Date(t.updatedAt).toLocaleDateString("ja-JP")}
            <ChevronRight size={14} />
          </div>
        </button>
      ))}
      <button className="template-card add-card" onClick={create}>
        <span>
          <Plus size={23} />
        </span>
        <b>新しいテンプレート</b>
        <p>帳票に合わせて自由に設定</p>
      </button>
    </div>
  );
}
function CaseList({
  cases,
  open,
  empty,
}: {
  cases: Case[];
  open: (c: Case) => void;
  empty: () => void;
}) {
  return cases.length ? (
    <div className="case-table">
      <div className="case-table-head">
        <span>案件名 / テンプレート</span>
        <span>作成・更新</span>
        <span>進捗</span>
        <span />
      </div>
      {cases.map((c) => (
        <button className="case-row" key={c.id} onClick={() => open(c)}>
          <div>
            <b>{c.name}</b>
            <small>{c.template.name}</small>
          </div>
          <div>
            <small>
              作成 {new Date(c.createdAt).toLocaleDateString("ja-JP")}
            </small>
            <small>更新 {new Date(c.updatedAt).toLocaleString("ja-JP")}</small>
          </div>
          <span className="badge">
            {c.entries.filter((e) => e.confirmed).length}/
            {c.template.items.length} 確定
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <FolderOpen size={29} />
      <h3>最初の案件を作成しましょう</h3>
      <p>テンプレートを選び、今回の資料から文章を作成できます。</p>
      <Button variant="outline" onClick={empty}>
        案件を作成 <ArrowUpRight size={14} />
      </Button>
    </div>
  );
}

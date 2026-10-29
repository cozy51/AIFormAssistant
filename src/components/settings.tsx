"use client";
import { useState } from "react";
import { Download, Upload, Trash2, RefreshCw } from "lucide-react";
import { db, backup, importBackup } from "@/lib/db";
import {
  BackupSchema,
  SettingsSchema,
  type Settings,
  type Backup,
} from "@/lib/schema";
import { api, downloadJson } from "@/lib/api";
import { Button } from "./ui/button";
export type Connection = {
  authenticated: boolean;
  email?: string;
  geminiConfigured: boolean;
  googleConfigured: boolean;
  model: string;
};
export function SettingsView({
  settings,
  connection,
  notify,
  refresh,
}: {
  settings: Settings;
  connection: Connection;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings),
    [models, setModels] = useState<string[]>([]),
    [pending, setPending] = useState<Backup | null>(null),
    [duplicates, setDuplicates] = useState(0),
    [replace, setReplace] = useState(false),
    [busy, setBusy] = useState(false);
  async function read(file?: File) {
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error("バックアップは50MB以下にしてください。");
      const value = BackupSchema.parse(JSON.parse(await file.text()));
      const t = await db.templates.toCollection().primaryKeys(),
        p = await db.cases.toCollection().primaryKeys(),
        d = await db.documents.toArray();
      setDuplicates(
        value.templates.filter((v) => t.includes(v.id)).length +
          value.cases.filter((v) => p.includes(v.id)).length +
          value.documents.filter((v) =>
            d.some(
              (x) =>
                x.id === v.id &&
                x.ownerId === v.ownerId &&
                x.category === v.category,
            ),
          ).length,
      );
      setPending(value);
    } catch {
      notify(
        "バックアップの形式・バージョンが正しくありません。正規のJSONエクスポートを指定してください。",
      );
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h1>設定とデータ管理</h1>
          <p className="muted">
            接続先と、端末内に保存されたデータを管理します。
          </p>
        </div>
      </div>
      <div className="two-column">
        <section className="panel field-stack">
          <h2>Google Drive 接続</h2>
          <p>
            接続状態：
            <span
              className={`badge ${connection.authenticated ? "success" : ""}`}
            >
              {connection.authenticated ? "接続済み" : "未接続"}
            </span>
          </p>
          {connection.email && <p>{connection.email}</p>}
          <p className="small muted">
            指定した既存ファイルを参照するため、Driveの読み取り専用権限を使用します。ファイルを変更・削除する権限は要求しません。
          </p>
          {connection.googleConfigured ? (
            <Button asChild>
              <a href="/api/auth/login">Google に接続・再認証</a>
            </Button>
          ) : (
            <>
              <p className="warning" role="alert">
                サーバーに Google OAuth
                のクライアントIDとシークレットが設定されていないため接続できません。管理者が環境変数
                GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET
                を設定し、サーバーを再起動してください。
              </p>
              <Button disabled>Google に接続・再認証</Button>
            </>
          )}
          {connection.authenticated && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await api("/api/auth/logout", {});
                  await refresh();
                  notify("接続を解除しました。端末内のデータは残ります。");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              接続を解除
            </Button>
          )}
          <p className="small muted">
            OAuth設定はサーバー環境変数で管理します。秘密情報をブラウザに保存しません。
          </p>
        </section>
        <section className="panel field-stack">
          <h2>Gemini API</h2>
          <p>
            サーバー設定：
            <span
              className={`badge ${connection.geminiConfigured ? "success" : ""}`}
            >
              {connection.geminiConfigured
                ? "APIキー設定済み"
                : "APIキー未設定"}
            </span>
          </p>
          <p className="small muted">
            キー設定済みの表示は、実際の接続成功を保証しません。「モデル一覧を取得」で接続を確認できます。
          </p>
          <label>
            使用モデル
            <input
              list="models"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
            <datalist id="models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api<{ models: string[] }>("/api/models");
                setModels(result.models);
                notify(
                  `${result.models.length}件の利用可能な安定版モデルを取得しました。`,
                );
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={15} />
            モデル一覧を取得・接続確認
          </Button>
          <p className="small muted">
            安定版のみ選択してください。Geminiは文章生成・PDF理解に使用します。
          </p>
        </section>
        <section className="panel field-stack">
          <h2>解析・表示設定</h2>
          <label>
            1ファイルの上限ページ数
            <input
              type="number"
              min="1"
              max="300"
              value={draft.maxPages}
              onChange={(e) =>
                setDraft({ ...draft, maxPages: Number(e.target.value) })
              }
            />
          </label>
          <label>
            1ファイルの上限サイズ（MB）
            <input
              type="number"
              min="1"
              max="40"
              value={draft.maxSizeMB}
              onChange={(e) =>
                setDraft({ ...draft, maxSizeMB: Number(e.target.value) })
              }
            />
          </label>
          <label>
            新規項目の目標文字数
            <input
              type="number"
              min="1"
              max="20000"
              value={draft.defaultTarget}
              onChange={(e) =>
                setDraft({ ...draft, defaultTarget: Number(e.target.value) })
              }
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.dark}
              onChange={(e) => setDraft({ ...draft, dark: e.target.checked })}
            />
            ダークモード
          </label>
          <Button
            onClick={async () => {
              try {
                await db.settings.put(SettingsSchema.parse(draft));
                notify("設定を保存しました。");
              } catch {
                notify("入力値の範囲を確認してください。");
              }
            }}
          >
            設定を保存
          </Button>
        </section>
        <section className="panel field-stack">
          <h2>データのバックアップ</h2>
          <p className="muted">
            テンプレート・案件・文章・編集履歴・PDF解析結果をJSONで保存します。認証トークンやAPIキーは含みません。
          </p>
          <p className="warning">
            バックアップには資料本文が含まれます。社内の情報管理ルールに従って保管してください。
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                downloadJson(await backup());
                notify("バックアップをエクスポートしました。");
              } catch {
                notify(
                  "エクスポートできません。保存容量とブラウザ設定を確認してください。",
                );
              }
            }}
          >
            <Download size={15} />
            JSONをエクスポート
          </Button>
          <label className="file-input">
            <Upload size={16} /> JSONをインポート
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {pending && (
            <div className="proposal">
              <h3>インポート前の確認</h3>
              <p>
                テンプレート {pending.templates.length}件 / 案件{" "}
                {pending.cases.length}件 / PDF {pending.documents.length}件
              </p>
              <p>重複するデータ：{duplicates}件</p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                重複データと設定を置換する（未選択時は既存を保持）
              </label>
              <p className="small muted">
                解析キャッシュは復元されますが、生成前にPDFを再解析して原本を検証する必要があります。
              </p>
              <div className="actions">
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await importBackup(pending, replace);
                      setPending(null);
                      notify("インポートが完了しました。");
                    } catch {
                      notify(
                        "保存に失敗しました。データは変更せずロールバックしました。",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  確認してインポート
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)}>
                  取り消す
                </Button>
              </div>
            </div>
          )}
          <hr />
          <Button
            variant="destructive"
            onClick={async () => {
              if (
                !confirm(
                  "このブラウザ内のすべてのテンプレート・案件・解析・履歴・設定を削除します。バックアップは取得済みですか？",
                )
              )
                return;
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
                      db.settings.clear(),
                    ]);
                  },
                );
                notify("端末内のデータを削除しました。");
              } catch {
                notify("データを削除できませんでした。");
              }
            }}
          >
            <Trash2 size={15} />
            すべての保存データを削除
          </Button>
        </section>
      </div>
    </>
  );
}

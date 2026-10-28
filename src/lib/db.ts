import Dexie, { type Table } from "dexie";
import {
  BackupSchema,
  type Backup,
  type Template,
  type Doc,
  type Case,
  type Settings,
  now,
} from "./schema";
export class AppDB extends Dexie {
  templates!: Table<Template, string>;
  documents!: Table<Doc, string>;
  cases!: Table<Case, string>;
  settings!: Table<Settings, string>;
  constructor(name = "ai-form-assistant") {
    super(name);
    this.version(1).stores({
      templates: "id, updatedAt",
      documents: "&[ownerId+category+id], ownerId, id, category",
      cases: "id, templateId, updatedAt",
      settings: "id",
    });
  }
}
export const db = new AppDB();
export const defaultSettings: Settings = {
  id: "main",
  model: "gemini-2.5-flash",
  dark: false,
  maxPages: 100,
  maxSizeMB: 20,
  defaultTarget: 300,
};
export async function backup(): Promise<Backup> {
  return BackupSchema.parse({
    version: 1,
    exportedAt: now(),
    templates: await db.templates.toArray(),
    documents: (await db.documents.toArray()).map((d) => ({
      ...d,
      signature: undefined,
    })),
    cases: await db.cases.toArray(),
    settings: await db.settings.get("main"),
  });
}
export async function importBackup(input: unknown, replace: boolean) {
  const data = BackupSchema.parse(input);
  await db.transaction(
    "rw",
    db.templates,
    db.documents,
    db.cases,
    db.settings,
    async () => {
      for (const row of data.templates) {
        if (replace || !(await db.templates.get(row.id)))
          await db.templates.put(row);
      }
      for (const row of data.cases) {
        if (replace || !(await db.cases.get(row.id))) await db.cases.put(row);
      }
      for (const row of data.documents) {
        const key: [string, string, string] = [
          row.ownerId,
          row.category,
          row.id,
        ];
        if (replace || !(await db.documents.get(key)))
          await db.documents.put({ ...row, signature: undefined });
      }
      if (data.settings && (replace || !(await db.settings.get("main"))))
        await db.settings.put(data.settings);
    },
  );
}
export async function removeTemplate(id: string) {
  await db.transaction("rw", db.templates, db.documents, async () => {
    await db.templates.delete(id);
    await db.documents.where("ownerId").equals(id).delete();
  });
}
export async function removeCase(id: string) {
  await db.transaction("rw", db.cases, db.documents, async () => {
    await db.cases.delete(id);
    await db.documents.where("ownerId").equals(id).delete();
  });
}

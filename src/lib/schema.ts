import { z } from "zod";
export const Category = z.enum(["past", "rules", "current"]);
export const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().nonnegative(),
  description: z.string().default(""),
  rules: z.string().default(""),
  target: z.number().int().min(1).max(20000).default(300),
  examples: z.array(z.string()).default([]),
  instruction: z.string().default(""),
});
export const PageSchema = z.object({
  page: z.number().int().positive(),
  text: z.string(),
  headings: z.array(z.string()),
  fields: z.array(z.object({ name: z.string(), content: z.string() })),
  tables: z.array(z.string()),
  figures: z.array(z.string()),
  uncertain: z.boolean(),
});
export const AnalysisSchema = z.object({
  pages: z.array(PageSchema).min(1),
  warnings: z.array(z.string()),
});
export const DocSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string(),
  category: Category,
  name: z.string(),
  modifiedTime: z.string(),
  size: z.number().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  status: z.enum(["registered", "analyzed", "error"]),
  analyzedAt: z.string().optional(),
  analysis: AnalysisSchema.optional(),
  signature: z.string().optional(),
  error: z.string().optional(),
});
export const StatSchema = z.object({
  itemId: z.string(),
  sourceName: z.string(),
  confirmed: z.boolean().default(false),
  fileId: z.string(),
  page: z.number().int().positive(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  structure: z.string(),
  expressions: z.array(z.string()),
  terms: z.array(z.string()),
  granularity: z.string(),
  bulletTrend: z.string(),
});
export const RuleSchema = z.object({
  id: z.string(),
  fileId: z.string(),
  page: z.number().int().positive(),
  text: z.string(),
  itemId: z.string(),
  kind: z.enum([
    "common",
    "required",
    "prohibited",
    "example",
    "length",
    "technical",
  ]),
  conflict: z.string(),
  reviewed: z.boolean().default(false),
  resolved: z.boolean().default(false),
});
export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  items: z.array(ItemSchema),
  stats: z.array(StatSchema),
  rules: z.array(RuleSchema),
  updatedAt: z.string(),
});
export const ReferenceSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  page: z.number().int().positive(),
  quote: z.string().trim().min(1),
  category: Category,
});
export const ResultSchema = z.object({
  itemId: z.string(),
  itemName: z.string(),
  generatedText: z.string(),
  characterCount: z.number().int().nonnegative(),
  targetCharacterCount: z.number().int().positive(),
  references: z.array(ReferenceSchema),
  missingInformation: z.array(z.string()),
  warnings: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export const CandidateSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  result: ResultSchema,
});
export const EntrySchema = z.object({
  additionalInstruction: z.string().optional(),
  itemId: z.string(),
  text: z.string(),
  confirmed: z.boolean(),
  selectedCandidateId: z.string().optional(),
  candidates: z.array(CandidateSchema),
  edits: z.array(
    z.object({ id: z.string(), text: z.string(), at: z.string() }),
  ),
});
export const CaseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  templateId: z.string(),
  template: TemplateSchema,
  instruction: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  entries: z.array(EntrySchema),
});
export const SettingsSchema = z.object({
  id: z.literal("main"),
  model: z.string().min(1).default("gemini-2.5-flash"),
  dark: z.boolean().default(false),
  maxPages: z.number().int().min(1).max(300).default(100),
  maxSizeMB: z.number().min(1).max(40).default(20),
  defaultTarget: z.number().int().min(1).max(20000).default(300),
});
export const BackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  templates: z.array(TemplateSchema),
  documents: z.array(DocSchema),
  cases: z.array(CaseSchema),
  settings: SettingsSchema.optional(),
});
export type Item = z.infer<typeof ItemSchema>;
export type Doc = z.infer<typeof DocSchema>;
export type Template = z.infer<typeof TemplateSchema>;
export type Case = z.infer<typeof CaseSchema>;
export type Entry = z.infer<typeof EntrySchema>;
export type Result = z.infer<typeof ResultSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type Backup = z.infer<typeof BackupSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export const count = (s: string) => Array.from(s).length;
export function driveId(input: string): string {
  const value = input.trim();
  if (/^[\w-]{10,200}$/.test(value)) return value;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      !["drive.google.com", "docs.google.com"].includes(u.hostname)
    )
      throw Error();
    const id =
      u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || u.searchParams.get("id");
    if (id && /^[\w-]{10,200}$/.test(id)) return id;
  } catch {}
  throw new Error(
    "Google Drive のPDFファイルID、またはファイルの共有URLを入力してください。フォルダは指定できません。",
  );
}
export function statsFor(t: Template, itemId: string) {
  const values = t.stats
    .filter((s) => s.itemId === itemId)
    .map((s) => count(s.content));
  return values.length
    ? {
        average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
      }
    : null;
}
export function verifyReferences(result: Result, docs: Doc[]): Result {
  const warnings = [...result.warnings];
  const references = result.references.filter((r) => {
    const d = docs.find((d) => d.id === r.fileId && d.category === r.category);
    const p = d?.analysis?.pages.find((p) => p.page === r.page);
    const normalized = (v: string) => v.replace(/\s+/g, "");
    const valid =
      !!p &&
      normalized(r.quote).length > 0 &&
      normalized(
        p.text +
          " " +
          p.fields.map((f) => f.content).join(" ") +
          " " +
          p.tables.join(" ") +
          " " +
          p.figures.join(" "),
      ).includes(normalized(r.quote));
    if (!valid)
      warnings.push(
        "照合できない参照元を除外しました。根拠を確認してください。",
      );
    else r.fileName = d!.name;
    return valid;
  });
  return {
    ...result,
    characterCount: count(result.generatedText),
    references,
    warnings: [...new Set(warnings)],
  };
}
export function addCandidate(entry: Entry | undefined, result: Result): Entry {
  return {
    ...(entry || {
      itemId: result.itemId,
      text: "",
      confirmed: false,
      edits: [],
      candidates: [],
    }),
    candidates: [
      ...(entry?.candidates || []),
      { id: uid(), createdAt: now(), result },
    ],
  };
}

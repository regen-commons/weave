/** Checked account data only. Conversations, files, AI records and unfinished edits stay local. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export interface AccountDocument {
  version: 1;
  initiative: JsonObject;
  needs: SavedAsk[];
  offers: SavedAsk[];
  funding: JsonObject;
}
export interface SavedAsk {
  id: string;
  value: JsonObject;
}
export interface SavedInitiative {
  id: string;
  revision: number;
  updatedAt: string;
  document: AccountDocument;
}
export interface InitiativeSummary {
  id: string;
  revision: number;
  name: string;
  updatedAt: string;
}
export interface AccountUser {
  id: string;
  email: string | null;
}
export const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_data");
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: string[]) {
  const object = record(value);
  if (Object.keys(object).length !== keys.length || keys.some((key) => !Object.hasOwn(object, key)))
    throw new Error("invalid_data");
  return object;
}
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()))
    throw new Error("invalid_data");
  return value;
}
function choice(value: unknown, values: string[]): string {
  const item = text(value, 80);
  if (!values.includes(item)) throw new Error("invalid_data");
  return item;
}
function list(value: unknown, max: number, length: number, values?: string[]): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("invalid_data");
  const result = value.map((item) => (values ? choice(item, values) : text(item, length, true)));
  if (new Set(result).size !== result.length) throw new Error("invalid_data");
  return result;
}
function nullable(value: unknown, max: number): string | null {
  return value === null ? null : text(value, max);
}
const CAPITALS = [
  "living",
  "material",
  "intellectual",
  "experiential",
  "social",
  "financial",
  "cultural",
  "spiritual",
];
const TERMS = ["gift", "exchange", "paid", "commitment", "open"];
const STAGES = ["seed", "sprout", "flowering", "tree"];
const LENSES = ["art_culture", "research", "technology", "place_based", "funders"];
function safeLink(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw Error();
    return value;
  } catch {
    throw new Error("invalid_data");
  }
}
function initiative(value: unknown): JsonObject {
  const o = exact(value, [
    "name",
    "description",
    "locations",
    "isGlobal",
    "links",
    "stage",
    "lenses",
    "themes",
    "beneficiaries",
    "languages",
  ]);
  if (typeof o.isGlobal !== "boolean") throw Error("invalid_data");
  const languages = list(o.languages, 6, 2);
  if (languages.some((item) => !/^[a-z]{2}$/u.test(item))) throw Error("invalid_data");
  return {
    name: text(o.name, 200, true),
    description: text(o.description, 800),
    locations: list(o.locations, 8, 120),
    isGlobal: o.isGlobal,
    links: list(o.links, 6, 2048).map(safeLink),
    stage: o.stage === null ? null : choice(o.stage, STAGES),
    lenses: list(o.lenses, 5, 80, LENSES),
    themes: list(o.themes, 10, 60),
    beneficiaries: list(o.beneficiaries, 6, 80),
    languages,
  };
}
export function parseSavedAsk(value: unknown): SavedAsk { return checkedAsk(value, false); }
function checkedAsk(value: unknown, allowUnclassified: boolean): SavedAsk {
  const row = exact(value, ["id", "value"]);
  if (!uuid(row.id)) throw Error("invalid_data");
  const o = exact(row.value, [
    "title",
    "description",
    "capitalForms",
    "amount",
    "timeframe",
    "urgency",
    "placeScope",
    "exchangeTerms",
    "purpose",
    "capacity",
    "audience",
    "status",
  ]);
  const capitalForms = list(o.capitalForms, 8, 80, CAPITALS),
    terms = list(o.exchangeTerms, 5, 80, TERMS);
  if ((!allowUnclassified && !capitalForms.length) || !terms.length || (terms.includes("open") && terms.length !== 1))
    throw Error("invalid_data");
  let amount: Json = null;
  if (o.amount !== null) {
    const a = exact(o.amount, ["min", "max", "currency"]);
    const valid = (n: unknown) => n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0);
    if (
      !capitalForms.includes("financial") ||
      !valid(a.min) ||
      !valid(a.max) ||
      (a.min === null && a.max === null) ||
      (typeof a.min === "number" && typeof a.max === "number" && a.min > a.max) ||
      typeof a.currency !== "string" ||
      !/^[A-Z]{3}$/u.test(a.currency)
    )
      throw Error("invalid_data");
    amount = { min: a.min as number | null, max: a.max as number | null, currency: a.currency };
  }
  return {
    id: row.id,
    value: {
      title: text(o.title, 140, true),
      description: nullable(o.description, 600),
      capitalForms,
      amount,
      timeframe: nullable(o.timeframe, 200),
      urgency: o.urgency === null ? null : choice(o.urgency, ["now", "this_quarter", "this_year", "ongoing"]),
      placeScope: choice(o.placeScope, ["here", "region", "anywhere"]),
      exchangeTerms: terms,
      purpose: nullable(o.purpose, 400),
      capacity: nullable(o.capacity, 200),
      audience: nullable(o.audience, 200),
      status: choice(o.status, ["open", "met", "withdrawn", "expired"]),
    },
  };
}
function asks(value: unknown, allowUnclassified: boolean): SavedAsk[] {
  if (!Array.isArray(value) || value.length > 5) throw Error("invalid_data");
  const rows = value.map(row => checkedAsk(row, allowUnclassified));
  if (new Set(rows.map((row) => row.id.toLowerCase())).size !== rows.length) throw Error("invalid_data");
  return rows;
}
function funding(value: unknown): JsonObject {
  const o = exact(value, ["form", "programAnswers"]),
    f = exact(o.form, [
      "workCountries",
      "benefitCountries",
      "applicantBaseCountry",
      "registrationCountry",
      "applicantType",
      "fundingInstruments",
      "goalMin",
      "goalMax",
      "currency",
      "usWorkStates",
      "usBenefitStates",
    ]);
  const form: JsonObject = {};
  for (const key of ["workCountries", "benefitCountries"]) form[key] = text(f[key], 800);
  for (const key of ["applicantBaseCountry", "registrationCountry"]) form[key] = text(f[key], 2);
  for (const key of ["goalMin", "goalMax"]) form[key] = text(f[key], 60);
  for (const key of ["usWorkStates", "usBenefitStates"]) form[key] = text(f[key], 200);
  form.currency = text(f.currency, 3);
  form.applicantType = choice(f.applicantType, [
    "unknown",
    "nonprofit",
    "informal",
    "individual",
    "business",
    "university",
    "public-body",
  ]);
  form.fundingInstruments = list(f.fundingInstruments, 5, 80, [
    "grant",
    "prize",
    "investment",
    "fellowship",
    "scholarship",
  ]);
  const answers: JsonObject = {};
  for (const [key, value] of Object.entries(record(o.programAnswers))) {
    if (!/^[a-zA-Z0-9_-]+::[a-zA-Z0-9_-]+::[a-zA-Z0-9_-]+$/u.test(key)) throw Error("invalid_data");
    const a = exact(value, ["answer", "sourceCheckedOn"]);
    const date = text(a.sourceCheckedOn, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw Error("invalid_data");
    answers[key] = { answer: choice(a.answer, ["yes", "no"]), sourceCheckedOn: date };
  }
  return { form, programAnswers: answers };
}
export function parseDocument(value: unknown): AccountDocument { return checkedDocument(value, true); }
export function parseTeamDocument(value: unknown): AccountDocument { return checkedDocument(value, true); }
function checkedDocument(value: unknown, allowUnclassified: boolean): AccountDocument {
  const o = exact(value, ["version", "initiative", "needs", "offers", "funding"]);
  if (o.version !== 1) throw Error("invalid_data");
  const result: AccountDocument = {
    version: 1,
    initiative: initiative(o.initiative),
    needs: asks(o.needs, allowUnclassified),
    offers: asks(o.offers, allowUnclassified),
    funding: funding(o.funding),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 60000) throw Error("document_too_large");
  return result;
}
export function parseSaved(value: unknown): SavedInitiative { return checkedSave(value, true); }
export function parseTeamSaved(value: unknown): SavedInitiative { return checkedSave(value, true); }
export type WorkspaceAccessRole = "viewer" | "editor" | "admin";
export function parseTeamWorkspace(value: unknown) {
  const row = record(value);
  return {
    accessRole: choice(row.accessRole, ["viewer", "editor", "admin"]) as WorkspaceAccessRole,
    saved: row.saved === null ? null : parseTeamSaved(row.saved),
    projectTitle: row.projectTitle === undefined ? null : nullable(row.projectTitle, 200),
    projectUri: row.projectUri === undefined ? null : nullable(row.projectUri, 2048),
  };
}
export type TeamWorkspaceState = ReturnType<typeof parseTeamWorkspace>;

function checkedSave(value: unknown, allowUnclassified: boolean): SavedInitiative {
  const o = record(value);
  if (
    !uuid(o.id) ||
    !Number.isSafeInteger(o.revision) ||
    Number(o.revision) < 1 ||
    typeof o.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(o.updatedAt))
  )
    throw Error("invalid_data");
  return {
    id: o.id,
    revision: Number(o.revision),
    updatedAt: o.updatedAt,
    document: checkedDocument(o.document, allowUnclassified),
  };
}
export function parseUser(value: unknown): AccountUser {
  const o = record(value);
  if (!uuid(o.id)) throw Error("invalid_data");
  // GoTrue can serialize an absent optional email as an empty string.
  return { id: o.id, email: o.email === null || o.email === undefined || o.email === "" ? null : text(o.email, 254, true) };
}
export function parseSummaries(value: unknown): InitiativeSummary[] {
  if (!Array.isArray(value) || value.length > 20) throw Error("invalid_data");
  return value.map((value) => {
    const o = record(value);
    if (
      !uuid(o.id) ||
      !Number.isSafeInteger(o.revision) ||
      Number(o.revision) < 1 ||
      typeof o.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(o.updatedAt))
    )
      throw Error("invalid_data");
    return { id: o.id, revision: Number(o.revision), updatedAt: o.updatedAt, name: text(o.name, 200, true) };
  });
}

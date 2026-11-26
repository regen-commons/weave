import { fullDate } from "../home.ts";

/**
 * What an export is made of, before it becomes a file (DL-152, DL-153). Funds and initiatives each
 * describe their records here; the CSV writer and the PDF maker know nothing about either.
 */

/** One line of a PDF block: a record's name, a fact, or a quieter note. */
export interface PdfLine {
  readonly text: string;
  readonly style: "name" | "body" | "quiet";
}

export interface PdfDocumentModel {
  readonly title: string;
  /** What it is, when it was made and from what. */
  readonly intro: string;
  /** One block per record, kept on one page where it fits. */
  readonly blocks: readonly (readonly PdfLine[])[];
  /** Said where there are no records. */
  readonly empty: string;
  /** The reminder at the foot of every page, before its page number. */
  readonly foot: string;
  /** The export's day, as an ISO day. */
  readonly createdOn: string;
}

/** A day as people read it, where it is an ISO day; anything else as it is. */
export function day(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/u.test(iso) ? fullDate(iso) : iso;
}

/** Short facts as one line of sentences, each ended once. */
export function sentence(parts: readonly string[]): string {
  const said = parts.map((part) => part.trim().replace(/[.\s]+$/u, "")).filter(Boolean);
  return said.length ? `${said.join(". ")}.` : "";
}

/**
 * One CSV cell. A spreadsheet runs a cell that starts with `=`, `+`, `-`, `@` or a control character
 * as a formula, so such a cell is written as text with a leading apostrophe. Every cell is quoted.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * Rows as CSV: a byte order mark so spreadsheets read it as UTF-8 and keep every letter, a heading
 * row, and Windows line ends, which every spreadsheet reads.
 */
export function csvText<T>(columns: readonly (readonly [keyof T, string])[], rows: readonly T[]): string {
  const lines = [
    columns.map(([, heading]) => csvCell(heading)).join(","),
    ...rows.map((row) => columns.map(([key]) => csvCell(String(row[key] ?? ""))).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** A file's name: what it holds and the day, so a second export the same day sits beside the first. */
export function exportFileName(what: string, createdOn: string, extension: "csv" | "pdf"): string {
  return `weave-${what}-${createdOn}.${extension}`;
}

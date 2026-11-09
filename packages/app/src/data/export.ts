import { DeviceDraftSchema, type AiRun, type DeviceDraft } from "../describe/contracts.ts";
import type { Attachment } from "../describe/source-contracts.ts";
import type { DraftBackup } from "../describe/repository.ts";

type ReadBlob = (blob: Blob) => Promise<string>;
async function filesForExport(files: readonly Attachment[], read: ReadBlob) {
  const result = [];
  // Read one file at a time so large attachments do not all occupy an encoder at once.
  for (const file of files)
    result.push({ ...file, blob: { encoding: "data-url", data: await read(file.blob) } });
  return result;
}
async function draftForExport(source: DeviceDraft, read: ReadBlob) {
  const draft = DeviceDraftSchema.parse(source);
  const attachments = await filesForExport(draft.attachments, read);
  const needs = { ...draft.needs, attachments: await filesForExport(draft.needs.attachments, read) };
  const offers = { ...draft.offers, attachments: await filesForExport(draft.offers.attachments, read) };
  return { ...draft, attachments, needs, offers };
}
/** A device snapshot, including source bytes and backups. It never fetches an account. */
export async function deviceExport(
  draft: DeviceDraft,
  backups: readonly DraftBackup[],
  theme: string,
  read: ReadBlob,
) {
  const current = await draftForExport(draft, read);
  const history = [];
  for (const backup of backups)
    history.push({ key: backup.key, draft: await draftForExport(backup.draft, read) });
  return {
    version: 1,
    scope: "this-device",
    exportedAt: new Date().toISOString(),
    theme,
    current,
    backups: history,
  };
}
export function assistantExport(runs: readonly AiRun[]) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    cloudWords: runs.reduce((sum, run) => sum + run.cloudWords, 0),
    runs: runs.map(({ id, step, engine, model, at, words, cloudWords, status, latencyMs }) => ({
      id,
      step,
      engine,
      model,
      at,
      words,
      cloudWords,
      status,
      latencyMs,
    })),
  };
}

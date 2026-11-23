import { useEffect, useRef, useState } from "react";
import type { AiRun } from "../describe/contracts.ts";
import { assistantExport } from "../data/export.ts";
import { downloadJson } from "../data/download.ts";
import { DATA_POLICY, STORAGE_SUMMARY } from "../data/privacy.ts";
import { fullDate } from "../home.ts";
import { COMMONS } from "../links.ts";
import { Link } from "../router.tsx";
import { Dialog } from "./Dialog.tsx";
import { focusDialogTitle } from "./focus.ts";
import { Icon } from "./Icon.tsx";
/** A run belongs to the part of the card it read, which is finer than the step map. */
const RUN_LABELS = { initiative: "Initiative", needs: "Needs", offers: "Offers" } as const;
export type Information = "storage" | "assistant" | "policy";
const TITLES = { storage: "What We Store", assistant: "What The Assistant Did", policy: "Data Policy" };
/**
 * Three separate things over the current page: a short answer to what Weave stores, the whole data
 * policy, and the assistant's metadata-only record.
 */
export function InformationDialog({
  information,
  onClose,
  onPolicy,
  runs,
}: {
  information: Information | null;
  onClose(): void;
  onPolicy(): void;
  runs: readonly AiRun[];
}) {
  const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const shown = useRef<Information | null>(null);
  useEffect(() => {
    setMessage("");
    // Read The Data Policy replaces what is shown, and with it the button that had the focus.
    if (shown.current && information && shown.current !== information) focusDialogTitle(dialog.current);
    shown.current = information;
  }, [information]);
  const cloudWords = runs.reduce((sum, run) => sum + run.cloudWords, 0);
  return (
    <Dialog ref={dialog} presentation="information" title={TITLES[information ?? "storage"]} open={!!information} onClose={onClose}>
        {information === "storage" ? (
          <>
            <dl className="rc-facts" data-kind="terms">
              {STORAGE_SUMMARY.map(([title, body]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{body}</dd>
                </div>
              ))}
            </dl>
            <button className="rc-button" data-variant="quiet" type="button" onClick={onPolicy}>
              Read The Data Policy
            </button>
          </>
        ) : information === "assistant" ? (
          <>
            <p>
              {runs.length} {runs.length === 1 ? "build or attempt" : "builds and attempts"}. {cloudWords}{" "}
              {cloudWords === 1 ? "word" : "words"} sent to the cloud. The record contains no source text.
            </p>
            {!runs.length ? (
              <p className="rc-meta">Nothing has run yet. Each build or attempt appears here.</p>
            ) : (
              <ol className="rc-record-list">
                {runs.map((run) => (
                  <li className="rc-record-row" key={run.id}>
                    <Icon name="device" size="sm" />
                    <div className="rc-record-text">
                      <h3 className="rc-record-title">
                        {RUN_LABELS[run.step]}:{" "}
                        {run.engine === "fixture" ? "Example" : "On this device"}
                      </h3>
                      <p className="rc-meta">
                        {run.model}.{" "}
                        {run.status === "complete"
                          ? "Completed"
                          : run.status === "cancelled"
                            ? "Cancelled"
                            : "Failed"}
                        . <time dateTime={run.at}>{fullDate(run.at.slice(0, 10))}</time>
                      </p>
                      <p className="rc-meta">
                        {run.words} {run.words === 1 ? "word" : "words"} read, {run.cloudWords} sent to the cloud.
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <button
              className="rc-button"
              data-variant="secondary"
              type="button"
              onClick={() => {
                try {
                  downloadJson("weave-assistant-record.json", assistantExport(runs));
                  setMessage("Assistant record download started. It contains metadata only.");
                } catch {
                  setMessage("The record could not be downloaded. It remains on this device.");
                }
              }}
            >
              Download Assistant Record
            </button>
            <p className="rc-meta">
              Cloud consent is off because cloud models are not connected. No consent withdrawal is needed for
              these local runs.
            </p>
          </>
        ) : (
          <>
            {DATA_POLICY.map((section) => (
              <section className="rc-stack" key={section.title}>
                <h3 className="rc-record-title">{section.title}</h3>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
            <p>
              To ask about your account or the copies saved in it,{" "}
              <Link href={COMMONS.website}>contact Regen Commons</Link>.
            </p>
          </>
        )}
        {message && (
          <p role="status" className="rc-meta">
            {message}
          </p>
        )}
    </Dialog>
  );
}

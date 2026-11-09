import { useEffect, useRef, useState } from "react";
import type { AiRun } from "../describe/contracts.ts";
import { assistantExport } from "../data/export.ts";
import { downloadJson } from "../data/download.ts";
import { INTAKE_STEPS } from "../routes.ts";
import { fullDate } from "../home.ts";
import { Icon } from "./Icon.tsx";
export type Information = "storage" | "assistant" | "policy";
const TITLES = { storage: "What we store", assistant: "What the assistant did", policy: "Data policy" };
const STORAGE = [
  ["Your draft", "Conversations, unfinished words and files stay in this browser."],
  ["When you save", "Checked cards go to Regen Commons, linked to your email."],
  ["Who can see it", "Saved copies are private. Database administrators can technically access them."],
  ["Your words", "Read on this device. Cloud models are not connected."],
  ["Leaving", "Sign-out keeps device copies. Download them in Settings; contact us about account deletion."],
];
/** Metadata-only record and concise storage facts over the current page. */
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
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (information && !dialog.open) dialog.showModal();
    if (!information && dialog.open) dialog.close();
    setMessage("");
  }, [information]);
  const cloudWords = runs.reduce((sum, run) => sum + run.cloudWords, 0);
  return (
    <dialog
      className="rc-dialog"
      data-presentation="information"
      ref={ref}
      aria-labelledby="frame-information-title"
      onClose={onClose}
    >
      <div className="rc-dialog-body">
        <div className="rc-dialog-head">
          <h2 className="rc-dialog-title" id="frame-information-title">
            {TITLES[information ?? "storage"]}
          </h2>
          <form method="dialog">
            <button className="rc-button" data-variant="secondary" type="submit">
              Close
            </button>
          </form>
        </div>
        {information === "storage" ? (
          <>
            <dl className="rc-facts">
              {STORAGE.map(([title, body]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{body}</dd>
                </div>
              ))}
            </dl>
            <button className="rc-button" data-variant="quiet" type="button" onClick={onPolicy}>
              Read the full data policy
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
                        {INTAKE_STEPS.find((step) => step.route === run.step)!.label}:{" "}
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
              Download assistant record
            </button>
            <p className="rc-meta">
              Cloud consent is off because cloud models are not connected. No consent withdrawal is needed for
              these local runs.
            </p>
          </>
        ) : (
          <>
            <p>
              Signing in sends your email and code to Regen Commons' account service. Saving sends only your
              checked card, kept needs and offers, and kept funding details to the existing Regen Commons
              database.
            </p>
            <p>
              Account copies are private to you in the product. Database administrators can technically access
              them. They are not public profiles or membership applications. Sharing with the community or
              other networks is not connected.
            </p>
            <p>
              Conversations, files, unfinished edits and assistant records remain on this device. The
              assistant uses keyword rules or an already available local browser model after your choice. No
              words are sent to a cloud model.
            </p>
            <p>
              Loading a saved card first backs up the current device draft. Sign-out ends this session and
              keeps device drafts and backups. Settings can download this device's data, including file bytes;
              it does not fetch every card saved in your account.
            </p>
            <p>
              Self-service account export and deletion are not connected.{" "}
              <a href="https://regencommons.com">Contact Regen Commons</a> about account copies. Clearing this
              site's browser storage removes device copies and cannot recover unsaved work.
            </p>
          </>
        )}
        {message && (
          <p role="status" className="rc-meta">
            {message}
          </p>
        )}
      </div>
    </dialog>
  );
}

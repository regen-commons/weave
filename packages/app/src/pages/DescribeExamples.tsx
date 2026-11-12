// Development-only interaction fixtures. No model, download or cloud request occurs here.
import { useEffect, useState } from "react";
import type { DescribeView } from "../fixtures.ts";
import { useDraft } from "../describe/use-draft.ts";
import { countWords } from "../describe/keywords.ts";
import { revise } from "../describe/contracts.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";
export function DescribeExamples({ view }: { view: DescribeView }) {
  const { controller } = useDraft();
  const [phase, setPhase] = useState<"off" | "paused" | "running" | "ready">(
    view === "downloading" ? "running" : "paused",
  );
  const [bytes, setBytes] = useState(view === "download-error" ? 118 : view === "downloading" ? 71 : 0);
  const [selected, setSelected] = useState(false);
  const [cloudError, setCloudError] = useState(view === "cloud-error");
  const [message, setMessage] = useState("");
  const isDownload = ["download", "downloading", "download-error"].includes(view);
  const isCloud = view === "cloud" || view === "cloud-error";
  // A consent question is a decision, so it is a task: a press outside never closes it.
  const [cloudOpen, setCloudOpen] = useState(isCloud);
  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => setBytes((current) => Math.min(250, current + 5)), 500);
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (bytes === 250) setPhase("ready");
  }, [bytes]);
  function simulate() {
    if (!selected) return;
    if (cloudError) {
      setCloudError(false);
      setMessage(
        "Example call failed. Nothing was sent. You can retry the simulation or keep the keyword draft.",
      );
      return;
    }
    const draft = controller.getSnapshot().draft;
    controller.change((current) =>
      revise(current, {
        runs: [
          ...current.runs,
          {
            id: crypto.randomUUID(),
            step: "initiative",
            engine: "fixture",
            model: "Cloud consent simulation",
            at: new Date().toISOString(),
            words: countWords(draft.turns.map((turn) => turn.text).join(" ")),
            cloudWords: 0,
            status: "complete",
            latencyMs: 0,
          },
        ],
      }),
    );
    setMessage("Consent example complete. Nothing was sent; zero cloud words were recorded.");
    setCloudOpen(false);
  }
  return (
    <>
      {isDownload && phase !== "off" && (
        <section className="rc-notice" data-tone="info">
          <div className="rc-notice-body">
            <h2 className="rc-notice-title">Keep your words on this device</h2>
            <p>Fictional download example, 250 MB. No bytes are downloaded.</p>
            {phase === "ready" ? (
              <p>Example model ready. This does not enable a real model.</p>
            ) : (
              <div className="rc-progress">
                <label htmlFor="download-example">
                  {phase === "running" ? "Example downloading" : "Example paused"}: {bytes} of 250 MB
                </label>
                <progress id="download-example" value={bytes} max={250}>
                  {bytes} MB
                </progress>
              </div>
            )}
            <div className="rc-action-bar">
              {phase === "running" ? (
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  onClick={() => setPhase("paused")}
                >
                  Cancel example download
                </button>
              ) : phase === "ready" ? (
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  onClick={() => {
                    setBytes(0);
                    setPhase("paused");
                  }}
                >
                  Remove example model
                </button>
              ) : (
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  onClick={() => setPhase("running")}
                >
                  {bytes ? "Resume example download" : "Start example download"}
                </button>
              )}
              <button
                className="rc-button"
                data-variant="quiet"
                type="button"
                onClick={() => setPhase("off")}
              >
                Not now
              </button>
            </div>
          </div>
        </section>
      )}
      {isCloud && (
        <button
          className="rc-button"
          data-variant="quiet"
          type="button"
          onClick={() => setCloudOpen(true)}
        >
          Cloud consent example
        </button>
      )}
      {message && (
        <p className="rc-meta" role="status">
          {message}
        </p>
      )}
      <TaskDialog title="Send this step to a cloud assistant?" open={cloudOpen} onClose={() => setCloudOpen(false)}>
        <form
          className="rc-stack"
          onSubmit={(event) => {
            event.preventDefault();
            simulate();
          }}
        >
          <p>Fictional consent example. Nothing is sent or kept by a provider.</p>
          <dl className="rc-facts">
            <div>
              <dt>Who runs it</dt>
              <dd>Example provider, example model</dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>Example region</dd>
            </div>
            <div>
              <dt>What is sent</dt>
              <dd>No data. This is a simulation.</dd>
            </div>
            <div>
              <dt>Never sent</dt>
              <dd>Audio and file bytes</dd>
            </div>
            <div>
              <dt>How long it is kept</dt>
              <dd>Nothing leaves this page</dd>
            </div>
          </dl>
          <label className="rc-menu-option">
            <input
              className="rc-check"
              type="checkbox"
              checked={selected}
              data-task-focus
              onChange={(event) => setSelected(event.target.checked)}
            />
            Use the description in this example only
          </label>
          <p className="rc-meta">
            Session and per-field live consent await D35. This example authorizes no later step.
          </p>
          {message && (
            <p className="rc-error" role="status">
              {message}
            </p>
          )}
          <div className="rc-action-bar">
            <button className="rc-button" data-variant="primary" type="submit" disabled={!selected}>
              Simulate this step once
            </button>
            <button
              className="rc-button"
              data-variant="quiet"
              type="button"
              onClick={() => setCloudOpen(false)}
            >
              Keep it on this device
            </button>
          </div>
        </form>
      </TaskDialog>
    </>
  );
}

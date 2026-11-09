import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_FILE_BYTES,
  assertBuildCurrent,
  addAnswer,
  nextQuestion,
  revise,
  type AiRun,
  type RecordForm,
} from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { availableBrowser, browserExtract } from "../describe/engines.ts";
import { keywordExtract } from "../describe/keyword-client.ts";
import { availableSpeech, startSpeech } from "../describe/speech.ts";
import { editsFromForm, formFrom, parseRecordForm } from "../describe/forms.ts";
import { draftText, previewFields } from "../describe/view.ts";
import type { FixtureContext } from "../fixtures.ts";
import { navigate } from "../router.tsx";
import { fixtureHref, INTAKE_STEPS, pathTo } from "../routes.ts";
import { AttachmentList } from "../ui/AttachmentList.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Conversation } from "../ui/Conversation.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Heading } from "../ui/Heading.tsx";
import { StepLayout, Stack } from "../ui/layouts.tsx";
import { RecordFields } from "../ui/RecordFields.tsx";
import { RecordPreview } from "../ui/RecordPreview.tsx";
import { Stepper } from "../ui/Stepper.tsx";
import { VoiceInput } from "../ui/VoiceInput.tsx";
import { DescribeExamples } from "./DescribeExamples.tsx";

export function Describe({ fixture: examples }: { fixture?: FixtureContext }) {
  const { draft, storage, error: storageError, ready, controller, fixture } = useDraft();
  const fields = previewFields(draft);
  const form = draft.form ?? formFrom(fields);
  const [language, setLanguage] = useState(navigator.language || "en-US");
  const [speechReady, setSpeechReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const link = draft.pendingLink;
  const task = useRef<AbortController | null>(null);
  const taskVersion = useRef<number | null>(null);
  const mic = useRef<{ stop(): void; dispose(): void } | null>(null);
  const micTask = useRef<AbortController | null>(null);
  const view = examples?.describe;
  useEffect(() => {
    let active = true;
    if (fixture) {
      setSpeechReady(view !== "weak");
      setModelReady(view === "browser");
    } else {
      void availableSpeech(language).then((value) => {
        if (active) setSpeechReady(value);
      });
      void availableBrowser().then((value) => {
        if (active) setModelReady(value);
      });
    }
    return () => {
      active = false;
    };
  }, [language, fixture, view]);
  useEffect(() => {
    setBusy(view === "building");
    setListening(view === "listening");
    setTranscript(view === "listening" ? "Families share what they learn about the orchard." : "");
    setNotice(
      view === "speech-error"
        ? "Example microphone error. Your words are still here; you can type below."
        : view === "weak"
          ? "Keyword mode is ready. No model download is needed."
          : "",
    );
    return () => {
      task.current?.abort();
      task.current = null;
      micTask.current?.abort();
      mic.current?.dispose();
    };
  }, [controller, view]);
  useEffect(() => {
    if (view === "storage-error" && ready && storage === "saved")
      controller.change((current) =>
        revise(current, { composer: current.composer || "An example change that could not be saved." }, true),
      );
  }, [controller, view, ready, storage]);
  useEffect(() => {
    if (taskVersion.current !== draft.inputVersion) task.current?.abort();
  }, [draft.inputVersion]);
  function changeForm(value: RecordForm) {
    controller.change((current) =>
      revise(current, { form: value, publicEdits: editsFromForm(value, current.publicEdits) }, true),
    );
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.composer.trim()) return;
    try {
      controller.change((current) => addAnswer(current, current.composer));
      setNotice("Answer added. You can change it above.");
    } catch {
      setNotice("Keep this answer under 20,000 characters.");
    }
  }
  async function speak() {
    if (fixture) {
      setListening(true);
      setTranscript("Families share what they learn about the orchard.");
      return;
    }
    const base = controller.getSnapshot().draft.composer;
    const abort = new AbortController();
    micTask.current = abort;
    setListening(true);
    setNotice("");
    try {
      mic.current = await startSpeech(
        language,
        {
          result: (final, interim) => {
            if (abort.signal.aborted) return;
            setTranscript([final, interim].filter(Boolean).join(" "));
            const composer = [base, final, interim].filter(Boolean).join(" ");
            if (composer.length > 20000) {
              abort.abort();
              setListening(false);
              setNotice("This answer reached 20,000 characters. Add it, then start another.");
              return;
            }
            controller.change((current) => revise(current, { composer }, true));
          },
          error: () =>
            setNotice("The microphone could not continue. Your words are still here. You can type below."),
          end: () => {
            setListening(false);
            setTranscript("");
          },
        },
        undefined,
        abort.signal,
      );
    } catch {
      if (!abort.signal.aborted)
        setNotice("Local speech is not ready. Your words are still here; you can type below.");
      setListening(false);
    }
  }
  function stopSpeech() {
    if (fixture) {
      controller.change((current) =>
        revise(current, { composer: [current.composer, transcript].filter(Boolean).join(" ") }, true),
      );
      setListening(false);
      setTranscript("");
      setNotice("Example transcript ready to edit below.");
    } else mic.current?.stop();
  }
  async function files(input: HTMLInputElement) {
    const selected = [...(input.files ?? [])];
    try {
      const attachments = selected.map((file) => {
        if (file.size > MAX_FILE_BYTES) throw new Error();
        return { id: crypto.randomUUID(), name: file.name, type: file.type, bytes: file.size, blob: file };
      });
      controller.change((current) =>
        revise(current, { attachments: [...current.attachments, ...attachments] }, true),
      );
      setNotice(
        "Files added on this device. Plain text and readable PDF text are read when you build; scanned pages and Office files may need you to add details.",
      );
    } catch {
      setNotice(
        "No files were added. Each file must be 25 MB or smaller and have a name under 256 characters.",
      );
    } finally {
      input.value = "";
    }
  }
  function addLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      controller.change((current) =>
        revise(current, { links: [...new Set([...current.links, link.trim()])], pendingLink: "" }, true),
      );
      setNotice("Link kept on this device. Its page has not been fetched.");
    } catch {
      setNotice("Use a complete http or https link without a password, up to six links.");
    }
  }
  async function build() {
    micTask.current?.abort();
    mic.current?.dispose();
    setListening(false);
    let source = controller.getSnapshot().draft;
    try {
      if (Object.values(source.answerEdits).some((value) => !value.trim())) throw new Error();
      if (Object.keys(source.answerEdits).length)
        source = controller.change((current) =>
          revise(
            current,
            {
              turns: current.turns.map((turn) => ({
                ...turn,
                text: current.answerEdits[turn.id]?.trim() ?? turn.text,
              })),
              answerEdits: {},
            },
            true,
          ),
        );
      if (source.pendingLink.trim())
        source = controller.change((current) =>
          revise(
            current,
            { links: [...new Set([...current.links, current.pendingLink.trim()])], pendingLink: "" },
            true,
          ),
        );
      if (source.composer.trim())
        source = controller.change((current) => addAnswer(current, current.composer));
    } catch {
      setNotice(
        "Keep a nonempty answer and add a complete link before building. Your draft text is still here.",
      );
      return;
    }
    const version = source.inputVersion;
    const abort = new AbortController();
    task.current?.abort();
    task.current = abort;
    taskVersion.current = version;
    setBusy(true);
    setNotice("");
    const started = performance.now();
    let words = 0;
    let nativeStarted = false;
    const valid = () => {
      assertBuildCurrent(controller.getSnapshot().draft, version, abort.signal);
    };
    const record = (engine: AiRun["engine"], status: AiRun["status"], model: string, start = started) =>
      controller.change((current) =>
        revise(current, {
          runs: [
            ...current.runs,
            {
              id: crypto.randomUUID(),
              step: "initiative",
              engine,
              model,
              at: new Date().toISOString(),
              words,
              cloudWords: 0,
              status,
              latencyMs: Math.max(0, Math.round(performance.now() - start)),
            },
          ],
        }),
      );
    try {
      const result = await keywordExtract(source, abort.signal);
      words = result.words;
      valid();
      controller.change((current) =>
        revise(current, {
          proposal: { ...result.suggestion, links: [...source.links] },
          proposalVersion: version,
          confirmed: null,
          lastBuild: {
            engine: "keywords",
            unreadFiles: result.unreadFiles,
            sourceCharacters: result.text.length,
            files: result.files,
            fallback: source.assistant === "browser" && !modelReady,
          },
        }),
      );
      record("keywords", "complete", "Keyword draft");
      if (source.assistant === "browser" && modelReady && !fixture) {
        const nativeStart = performance.now();
        nativeStarted = true;
        try {
          const suggestion = await browserExtract(result.text, abort.signal);
          valid();
          controller.change((current) =>
            revise(current, {
              proposal: {
                ...suggestion,
                locations: result.suggestion.locations,
                isGlobal: result.suggestion.isGlobal,
                links: [...source.links],
              },
              lastBuild: {
                engine: "browser",
                unreadFiles: result.unreadFiles,
                sourceCharacters: result.text.length,
                files: result.files,
                fallback: source.assistant === "browser" && !modelReady,
              },
            }),
          );
          record("browser", "complete", "Browser-managed model", nativeStart);
        } catch {
          valid();
          record("browser", "failed", "Browser-managed model", nativeStart);
          controller.change((current) =>
            revise(current, {
              lastBuild: {
                engine: "keywords",
                unreadFiles: result.unreadFiles,
                sourceCharacters: result.text.length,
                files: result.files,
                fallback: true,
              },
            }),
          );
        }
      }
      valid();
      navigate(fixtureHref(pathTo("check-card"), window.location.search, import.meta.env.DEV));
    } catch (failure) {
      if (abort.signal.aborted || (failure instanceof DOMException && failure.name === "AbortError")) {
        record(
          nativeStarted ? "browser" : "keywords",
          "cancelled",
          nativeStarted ? "Browser-managed model" : "Keyword draft",
        );
        if (task.current === abort) setNotice("Stopped. Your words are still here.");
      } else {
        record("keywords", "failed", "Keyword draft");
        if (task.current === abort)
          setNotice(
            "The local reader could not finish. Your words are still here. Try again or use the four fields.",
          );
      }
    } finally {
      if (task.current === abort) {
        task.current = null;
        setBusy(false);
      }
    }
  }
  function manual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const publicFields = parseRecordForm(form);
      const source = controller.getSnapshot().draft;
      controller.change((current) =>
        revise(current, {
          publicEdits: publicFields,
          proposal: {
            ...previewFields(current),
            ...publicFields,
            stage: null,
            lenses: [],
            themes: [],
            beneficiaries: [],
            languages: [],
            confidence: 1,
          },
          proposalVersion: source.inputVersion,
          confirmed: null,
          lastBuild: {
            engine: "manual",
            unreadFiles: current.attachments.length,
            sourceCharacters: publicFields.description.length,
            files: [],
            fallback: false,
          },
        }),
      );
      navigate(fixtureHref(pathTo("check-card"), window.location.search, import.meta.env.DEV));
    } catch {
      setNotice("Check the four fields. Use up to eight places and six complete http or https links.");
    }
  }
  const references = (
    <>
      <div className="rc-field">
        <label htmlFor="describe-files">Add files</label>
        <p className="rc-hint">
          Up to 25 MB each. Plain text and PDF text are read here. Scanned pages and Office files are kept
          without reading their content.
        </p>
        <input
          className="rc-input"
          type="file"
          id="describe-files"
          multiple
          onChange={(event) => void files(event.currentTarget)}
        />
      </div>
      {draft.mode !== "fields" && (
        <form className="rc-field" onSubmit={addLink}>
          <label htmlFor="describe-link">Add a link</label>
          <p className="rc-hint">Its address stays here. The page is not fetched.</p>
          <div className="rc-inline-field">
            <input
              className="rc-input"
              type="url"
              id="describe-link"
              value={link}
              maxLength={2048}
              onChange={(event) =>
                controller.change((current) => revise(current, { pendingLink: event.target.value }, true))
              }
              required
            />
            <button className="rc-button" data-variant="secondary" type="submit">
              Add link
            </button>
          </div>
        </form>
      )}
      <AttachmentList
        files={draft.attachments}
        links={draft.links}
        onRemoveFile={(id) =>
          controller.change((current) =>
            revise(current, { attachments: current.attachments.filter((file) => file.id !== id) }, true),
          )
        }
        onRemoveLink={(url) =>
          controller.change((current) =>
            revise(current, { links: current.links.filter((value) => value !== url) }, true),
          )
        }
      />
    </>
  );
  return (
    <Stack>
      <Stepper steps={INTAKE_STEPS.map((step) => step.label)} current={0} />
      <Heading level={1} size="page">
        Tell us about your initiative
      </Heading>
      <DraftNotice
        error={storageError}
        text={draftText(draft)}
        conflict={storage === "conflict"}
        onRetry={() => controller.retry()}
      />
      {!ready ? (
        <p role="status">Opening your device draft</p>
      ) : (
        <StepLayout aside={<RecordPreview fields={fields} confirmed={!!draft.confirmed} />}>
          {(view === "offline" || !navigator.onLine) && (
            <p className="rc-notice" data-tone="info">
              You are offline. This conversation stays on this device.
            </p>
          )}
          {import.meta.env.DEV && fixture && view && <DescribeExamples key={view} view={view} />}
          {draft.mode === "fields" ? (
            <form className="rc-form" onSubmit={manual}>
              <RecordFields value={form} onChange={changeForm} />
              <div className="rc-action-bar">
                <button className="rc-button" data-variant="primary" type="submit">
                  Check my card
                </button>
                <button
                  className="rc-button"
                  data-variant="quiet"
                  type="button"
                  onClick={() =>
                    controller.change((current) =>
                      revise(current, { mode: "conversation", assistant: "keywords" }),
                    )
                  }
                >
                  Talk it through instead
                </button>
              </div>
            </form>
          ) : (
            <section className="rc-guide rc-conversation-panel" aria-label="Describe your initiative">
              <p className="rc-guide-status">
                Assistant on this device. Guided questions,{" "}
                {draft.assistant === "browser" && modelReady && !fixture
                  ? "browser model ready"
                  : "keyword draft"}
                .
              </p>
              <Conversation
                turns={draft.turns}
                question={nextQuestion(draft)}
                edits={draft.answerEdits}
                onDraftEdit={(id, value) =>
                  controller.change((current) =>
                    revise(
                      current,
                      { answerEdits: { ...current.answerEdits, [id]: value } },
                      value !==
                        (current.answerEdits[id] ?? current.turns.find((turn) => turn.id === id)?.text),
                    ),
                  )
                }
                onCancel={(id) =>
                  controller.change((current) =>
                    revise(current, {
                      answerEdits: Object.fromEntries(
                        Object.entries(current.answerEdits).filter(([key]) => key !== id),
                      ),
                    }),
                  )
                }
                onEdit={(id, text) => {
                  try {
                    controller.change((current) =>
                      revise(
                        current,
                        {
                          turns: current.turns.map((turn) =>
                            turn.id === id ? { ...turn, text: text.trim() } : turn,
                          ),
                          answerEdits: Object.fromEntries(
                            Object.entries(current.answerEdits).filter(([key]) => key !== id),
                          ),
                        },
                        true,
                      ),
                    );
                  } catch {
                    setNotice("Keep a nonempty answer under 20,000 characters.");
                  }
                }}
              />
              <VoiceInput
                available={speechReady}
                listening={listening}
                transcript={transcript}
                language={language}
                onLanguage={setLanguage}
                onStart={() => void speak()}
                onStop={stopSpeech}
              />
              <form className="rc-composer" onSubmit={add}>
                <label htmlFor="describe-answer">Type your answer, or edit what you said</label>
                <textarea
                  className="rc-input"
                  id="describe-answer"
                  rows={4}
                  maxLength={20000}
                  value={draft.composer}
                  disabled={listening}
                  onChange={(event) =>
                    controller.change((current) => revise(current, { composer: event.target.value }, true))
                  }
                />
                <div className="rc-action-bar">
                  <button
                    className="rc-button"
                    data-variant="secondary"
                    type="submit"
                    disabled={!draft.composer.trim() || listening}
                  >
                    Add your answer
                  </button>
                </div>
              </form>
              {modelReady && !draft.assistantPromptDismissed && draft.assistant !== "browser" && (
                <section className="rc-notice" data-tone="info">
                  <div className="rc-notice-body">
                    <h2 className="rc-notice-title">Build your card on this device</h2>
                    <p>
                      This browser already has a local model. Your words stay on this device; no model is
                      downloaded by Weave.
                    </p>
                    <div className="rc-action-bar">
                      <button
                        className="rc-button"
                        data-variant="secondary"
                        type="button"
                        onClick={() =>
                          controller.change((current) =>
                            revise(current, { assistant: "browser", assistantPromptDismissed: true }),
                          )
                        }
                      >
                        {fixture ? "Try the browser option example" : "Use this browser's assistant"}
                      </button>
                      <button
                        className="rc-button"
                        data-variant="quiet"
                        type="button"
                        onClick={() =>
                          controller.change((current) => revise(current, { assistantPromptDismissed: true }))
                        }
                      >
                        Not now
                      </button>
                    </div>
                  </div>
                </section>
              )}
              {draft.assistant === "browser" && (
                <p className="rc-meta">
                  {fixture
                    ? "Browser option example selected; the keyword draft powers this simulation."
                    : modelReady
                      ? "Browser model selected. It runs only when you build; keyword mode remains available."
                      : "The browser model is not ready. Build uses the keyword draft."}
                </p>
              )}
              {references}
              <div className="rc-action-bar">
                <button
                  className="rc-button"
                  data-variant="primary"
                  data-size="lg"
                  type="button"
                  aria-busy={busy}
                  disabled={
                    busy ||
                    listening ||
                    !(
                      draft.turns.length ||
                      draft.composer.trim() ||
                      draft.pendingLink.trim() ||
                      draft.attachments.length ||
                      draft.links.length
                    )
                  }
                  onClick={() => void build()}
                >
                  {busy ? "Building your card" : "Build my card"}
                </button>
                {busy && (
                  <button
                    className="rc-button"
                    data-variant="secondary"
                    type="button"
                    onClick={() => {
                      task.current?.abort();
                      setBusy(false);
                      setNotice("Stopped. Your words are still here.");
                    }}
                  >
                    Cancel building
                  </button>
                )}
                <button
                  className="rc-button"
                  data-variant="quiet"
                  type="button"
                  onClick={() => {
                    task.current?.abort();
                    micTask.current?.abort();
                    mic.current?.dispose();
                    setListening(false);
                    controller.change((current) => revise(current, { mode: "fields", assistant: "none" }));
                  }}
                >
                  Use the four fields
                </button>
              </div>
            </section>
          )}
          {draft.mode === "fields" && references}
          {notice && (
            <p className="rc-meta" role="status">
              {notice}
            </p>
          )}
          {draft.proposal && (
            <ButtonLink variant="quiet" href={pathTo("check-card")}>
              Check the current card
            </ButtonLink>
          )}
        </StepLayout>
      )}
    </Stack>
  );
}

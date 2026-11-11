import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_FILE_BYTES,
  assertBuildCurrent,
  addAnswer,
  nextQuestion,
  revise,
  type AiRun,
  type DeviceDraft,
  type RecordForm,
} from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { availableBrowser, browserExtract } from "../describe/engines.ts";
import { keywordExtract } from "../describe/keyword-client.ts";
import { availableSpeech, startSpeech } from "../describe/speech.ts";
import { editsFromForm } from "../describe/forms.ts";
import {
  FieldsProblem,
  afterFields,
  builtCard,
  continueWithFields,
  describeView,
  fieldsForm,
  fieldsLead,
  talkItThrough,
  type DescribeMode,
} from "../describe/screen.ts";
import { draftText, hasDraft, previewFields } from "../describe/view.ts";
import type { FixtureContext } from "../fixtures.ts";
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, INTAKE_STEPS, pathTo } from "../routes.ts";
import { AttachmentList } from "../ui/AttachmentList.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Conversation } from "../ui/Conversation.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Heading } from "../ui/Heading.tsx";
import { NarrowLayout, StepLayout, Stack } from "../ui/layouts.tsx";
import { RecordFields } from "../ui/RecordFields.tsx";
import { RecordPreview } from "../ui/RecordPreview.tsx";
import { Stepper } from "../ui/Stepper.tsx";
import { VoiceInput } from "../ui/VoiceInput.tsx";
import { DescribeExamples } from "./DescribeExamples.tsx";
import { useSocialFixture } from "../social/context.tsx";
import { useAccountDoor } from "../account/door.tsx";

/** The one file input of the step. Its label and hint say what happens to a file in the view it sits in. */
function FileField({
  label,
  hint,
  onFiles,
}: {
  label: string;
  hint: string;
  onFiles(input: HTMLInputElement): void;
}) {
  return (
    <div className="rc-field">
      <label htmlFor="describe-files">{label}</label>
      <p className="rc-hint" id="describe-files-hint">
        {hint}
      </p>
      <input
        className="rc-input"
        type="file"
        id="describe-files"
        aria-describedby="describe-files-hint"
        multiple
        onChange={(event) => onFiles(event.currentTarget)}
      />
    </div>
  );
}

/**
 * The describe step. It opens on the four fields with one Continue, and a new initiative is
 * invited to speak first where this device can transcribe speech. Talking it through is the other
 * way in, and that path ends at the check card because the app proposes the details.
 */
export function Describe({ fixture: examples }: { fixture?: FixtureContext }) {
  const { draft, storage, error: storageError, ready, controller, fixture } = useDraft();
  const social = useSocialFixture();
  const openDoor = useAccountDoor();
  // A view picked in this visit holds only for the draft it was picked on.
  const [choice, setChoice] = useState<{ controller: typeof controller; view: DescribeMode } | null>(null);
  const shown = describeView(draft, choice?.controller === controller ? choice.view : null);
  const form = fieldsForm(draft);
  const [problem, setProblem] = useState("");
  const [language, setLanguage] = useState(navigator.language || "en-US");
  const [speechReady, setSpeechReady] = useState(false);
  const lead = fieldsLead(draft, speechReady);
  const [modelReady, setModelReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [spoke, setSpoke] = useState(false);
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
        ? "The microphone did not work. Your words are still here; you can type below."
        : view === "weak"
          ? "Keyword mode is ready. No model download is needed."
          : "",
    );
    setProblem("");
    return () => {
      task.current?.abort();
      task.current = null;
      micTask.current?.abort();
      mic.current?.dispose();
    };
  }, [controller, view]);
  useEffect(() => {
    if (import.meta.env.DEV && view === "storage-error" && ready && storage === "saved")
      controller.change((current) =>
        revise(current, { composer: current.composer || "A change that could not be saved." }, true),
      );
  }, [controller, view, ready, storage]);
  useEffect(() => {
    if (taskVersion.current !== draft.inputVersion) task.current?.abort();
  }, [draft.inputVersion]);
  function changeForm(value: RecordForm) {
    setProblem("");
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
      setNotice("Transcript ready to edit below.");
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
      setNotice(attachments.length === 1 ? "File added on this device." : "Files added on this device.");
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
        builtCard(current, { ...result.suggestion, links: [...source.links] }, version, {
          engine: "keywords",
          unreadFiles: result.unreadFiles,
          sourceCharacters: result.text.length,
          files: result.files,
          fallback: source.assistant === "browser" && !modelReady,
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
      navigate(fixtureHref(pathTo("check-card"), routeSearch(), import.meta.env.DEV));
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
  function continueFields(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let next: DeviceDraft;
    try {
      next = controller.change(continueWithFields);
    } catch (error) {
      setProblem(error instanceof FieldsProblem ? error.message : "Check the four fields and try again.");
      return;
    }
    navigate(fixtureHref(pathTo(afterFields(next)), routeSearch(), import.meta.env.DEV));
  }
  function talk() {
    setChoice({ controller, view: "conversation" });
    setProblem("");
    setNotice("");
    controller.change(talkItThrough);
  }
  /** Speak from the four fields: the conversation opens already listening, with the focus on its button. */
  function talkAloud() {
    setSpoke(true);
    talk();
    void speak();
  }
  function showFields() {
    task.current?.abort();
    micTask.current?.abort();
    mic.current?.dispose();
    setListening(false);
    setSpoke(false);
    setChoice({ controller, view: "fields" });
    setNotice("");
    controller.change((current) => revise(current, { mode: "fields", assistant: "none" }));
  }
  const removeFile = (id: string) =>
    controller.change((current) =>
      revise(current, { attachments: current.attachments.filter((file) => file.id !== id) }, true),
    );
  const removeLink = (url: string) =>
    controller.change((current) =>
      revise(current, { links: current.links.filter((value) => value !== url) }, true),
    );
  const offline = view === "offline" || !navigator.onLine;
  const status = notice && (
    <p className="rc-meta" role="status">
      {notice}
    </p>
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
      {/* Asked before anything is typed, so a project that already exists is not described twice. */}
      {import.meta.env.DEV && social && ready && !social.state.identity && !hasDraft(draft) && (
        <div className="rc-action-bar">
          <button
            className="rc-button"
            data-variant="quiet"
            data-size="sm"
            type="button"
            onClick={() => openDoor("certified")}
          >
            Sign in to start from a Certified project
          </button>
        </div>
      )}
      {!ready ? (
        <p role="status">Opening your device draft</p>
      ) : shown === "fields" ? (
        <NarrowLayout>
          {offline && (
            <p className="rc-notice" data-tone="info">
              You are offline. Your details stay on this device.
            </p>
          )}
          {import.meta.env.DEV && fixture && view && <DescribeExamples key={view} view={view} />}
          {lead.voice && (
            <>
              <p>Say it in your own words. Weave turns what you say into a card you can check.</p>
              <VoiceInput
                available
                listening={false}
                transcript=""
                language={language}
                onLanguage={setLanguage}
                onStart={talkAloud}
                onStop={stopSpeech}
                variant={lead.primary === "speak" ? "primary" : "secondary"}
              />
            </>
          )}
          <form className="rc-form" onSubmit={continueFields}>
            {lead.voice && (
              <Heading level={2} size="section">
                Or type it
              </Heading>
            )}
            <RecordFields value={form} onChange={changeForm} />
            {problem && (
              <p className="rc-error" role="alert">
                {problem}
              </p>
            )}
            <div className="rc-action-bar">
              <button
                className="rc-button"
                data-variant={lead.primary === "continue" ? "primary" : "secondary"}
                type="submit"
              >
                Continue
              </button>
              {!lead.voice && (
                <button className="rc-button" data-variant="secondary" type="button" onClick={talk}>
                  Talk it through instead
                </button>
              )}
            </div>
          </form>
          <details>
            <summary className="rc-footer-link">Add files</summary>
            <FileField
              label="Files"
              hint="Up to 25 MB each. They stay on this device and are read only if you talk it through."
              onFiles={(input) => void files(input)}
            />
          </details>
          <AttachmentList
            files={draft.attachments}
            readOnBuild={false}
            links={[]}
            onRemoveFile={removeFile}
            onRemoveLink={removeLink}
          />
          {status}
        </NarrowLayout>
      ) : (
        <StepLayout aside={<RecordPreview fields={previewFields(draft)} confirmed={!!draft.confirmed} />}>
          {offline && (
            <p className="rc-notice" data-tone="info">
              You are offline. This conversation stays on this device.
            </p>
          )}
          {import.meta.env.DEV && fixture && view && <DescribeExamples key={view} view={view} />}
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
              focus={spoke}
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
                      Use this browser's assistant
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
                {modelReady && !fixture
                  ? "Browser model selected. It runs only when you build; keyword mode remains available."
                  : "The browser model is not ready. Build uses the keyword draft."}
              </p>
            )}
            <FileField
              label="Add files"
              hint="Up to 25 MB each. Plain text and PDF text are read on this device when you build."
              onFiles={(input) => void files(input)}
            />
            <form className="rc-field" onSubmit={addLink}>
              <label htmlFor="describe-link">Add a link</label>
              <p className="rc-hint" id="describe-link-hint">
                Its address stays here. The page is not fetched.
              </p>
              <div className="rc-inline-field">
                <input
                  className="rc-input"
                  type="url"
                  id="describe-link"
                  aria-describedby="describe-link-hint"
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
            <AttachmentList
              files={draft.attachments}
              links={draft.links}
              onRemoveFile={removeFile}
              onRemoveLink={removeLink}
            />
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
              <button className="rc-button" data-variant="quiet" type="button" onClick={showFields}>
                Use the four fields
              </button>
            </div>
          </section>
          {status}
          {draft.proposal && draft.proposalVersion === draft.inputVersion && (
            <ButtonLink variant="quiet" href={pathTo("check-card")}>
              Check your card
            </ButtonLink>
          )}
        </StepLayout>
      )}
    </Stack>
  );
}

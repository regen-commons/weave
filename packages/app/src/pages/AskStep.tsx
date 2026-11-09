import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_FILE_BYTES, type Turn } from "../describe/source-contracts.ts";
import { revise } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { draftText } from "../describe/view.ts";
import { availableSpeech, startSpeech } from "../describe/speech.ts";
import { ASK_LIMIT, type AskItem, type AskKind, type AskStep as Step } from "../intake/contracts.ts";
import {
  activeItems,
  answerStep,
  addStepFiles,
  changeStep,
  commitPending,
  decide,
  formFromAsk,
  keepEditor,
  keepLink,
  question,
  reconcile,
  reviewStep,
} from "../intake/state.ts";
import { extractAsks } from "../intake/extract-client.ts";
import { navigate } from "../router.tsx";
import { fixtureHref, INTAKE_STEPS, pathTo } from "../routes.ts";
import type { FixtureContext } from "../fixtures.ts";
import { AskCard } from "../ui/AskCard.tsx";
import { AskEditor } from "../ui/AskEditor.tsx";
import { AttachmentList } from "../ui/AttachmentList.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Conversation } from "../ui/Conversation.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Heading } from "../ui/Heading.tsx";
import { Stack, StepLayout } from "../ui/layouts.tsx";
import { Stepper } from "../ui/Stepper.tsx";
import { VoiceInput } from "../ui/VoiceInput.tsx";

export function AskStep({ kind, fixture: example }: { kind: AskKind; fixture?: FixtureContext }) {
  const { draft, controller, ready, storage, error: storageError, fixture } = useDraft();
  const step = draft[kind];
  const need = kind === "needs";
  const [notice, setNotice] = useState("");
  const [editorError, setEditorError] = useState("");
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState(navigator.language || "en-US");
  const [speechReady, setSpeechReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const task = useRef<AbortController | null>(null);
  const taskVersion = useRef<number | null>(null);
  const mic = useRef<{ stop(): void; dispose(): void } | null>(null);
  const micTask = useRef<AbortController | null>(null);
  const focusIntent = useRef<string | null>(null);
  const update = (change: (step: Step) => Step) =>
    controller.change((current) => revise(current, { [kind]: change(current[kind]) }))[kind];
  useEffect(() => {
    setBusy(example?.intake === "loading");
    setNotice(
      example?.intake === "error"
        ? "Example model error. These are keyword cards; make cards again or change them by hand."
        : "",
    );
  }, [example?.intake]);
  useEffect(() => {
    if (example?.intake === "storage-error" && ready && storage === "saved")
      update((current) =>
        changeStep(
          current,
          { composer: current.composer || "An example change that could not be saved." },
          true,
        ),
      );
  }, [example?.intake, ready, storage]);
  useEffect(() => {
    let active = true;
    if (fixture) setSpeechReady(true);
    else
      void availableSpeech(language).then((value) => {
        if (active) setSpeechReady(value);
      });
    return () => {
      active = false;
    };
  }, [language, fixture]);
  useEffect(
    () => () => {
      task.current?.abort();
      micTask.current?.abort();
      mic.current?.dispose();
    },
    [controller, kind],
  );
  useEffect(() => {
    if (taskVersion.current !== step.inputVersion) task.current?.abort();
  }, [step.inputVersion]);
  useEffect(() => {
    if (
      ready &&
      draft.assistant === "none" &&
      !step.turns.length &&
      !step.items.length &&
      step.mode !== "manual"
    )
      update((current) => changeStep(current, { mode: "manual" }));
  }, [ready, draft.assistant, step.mode, step.turns.length, step.items.length]);
  useEffect(() => {
    if (focusIntent.current) {
      document.getElementById(focusIntent.current)?.focus();
      focusIntent.current = null;
    }
  }, [step.editor, step.items]);
  function perform(action: () => void) {
    try {
      action();
      setEditorError("");
    } catch (error) {
      setNotice(
        error instanceof Error && !error.message.startsWith("[")
          ? error.message
          : "Choose at least one kind of support, then check this card.",
      );
    }
  }
  async function makeCards(via: Turn["via"] = "typed") {
    if (controller.getSnapshot().draft[kind].editor) {
      setNotice("Keep or cancel your open card before making new cards.");
      return;
    }
    micTask.current?.abort();
    mic.current?.dispose();
    setListening(false);
    let source: Step;
    try {
      source = update((current) => commitPending(current, kind, via));
    } catch {
      setNotice(
        "Keep a nonempty answer and add a complete http or https link before making cards. Your words are still here.",
      );
      return;
    }
    const abort = new AbortController();
    task.current?.abort();
    task.current = abort;
    taskVersion.current = source.inputVersion;
    setBusy(true);
    setNotice("");
    const started = performance.now();
    const valid = () => {
      abort.signal.throwIfAborted();
      if (controller.getSnapshot().draft[kind].inputVersion !== source.inputVersion)
        throw new DOMException("Words changed", "AbortError");
    };
    try {
      const result = await extractAsks(
        source,
        kind,
        abort.signal,
        controller.getSnapshot().draft.assistant === "browser" && !fixture,
      );
      valid();
      controller.change((current) =>
        revise(current, {
          [kind]: { ...reconcile(current[kind], result.extraction), lastBuild: result.lastBuild },
          runs: [
            ...current.runs,
            ...result.attempts.map((attempt) => ({
              id: crypto.randomUUID(),
              step: kind,
              engine: attempt.engine,
              model: attempt.engine === "browser" ? "Browser-managed model" : "Keyword cards",
              at: new Date().toISOString(),
              words: result.words,
              cloudWords: 0 as const,
              status: attempt.status,
              latencyMs: attempt.latencyMs,
            })),
          ],
        }),
      );
      if (task.current === abort)
        setNotice(
          result.extraction.heard
            ? "Cards are ready in pencil. Keep what is right, change or remove the rest."
            : "No new cards were found. Kept cards and removals are unchanged; you can add one by hand.",
        );
    } catch (error) {
      const cancelled =
        abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      controller.change((current) =>
        revise(current, {
          runs: [
            ...current.runs,
            {
              id: crypto.randomUUID(),
              step: kind,
              engine: "keywords",
              model: "Local card attempt",
              at: new Date().toISOString(),
              words: 0,
              cloudWords: 0,
              status: cancelled ? "cancelled" : "failed",
              latencyMs: Math.round(performance.now() - started),
            },
          ],
        }),
      );
      if (task.current === abort)
        setNotice(
          cancelled
            ? "Stopped. Your words are still here; make cards when you are ready."
            : "The local reader could not finish. Your words are still here. Try again or add a card by hand.",
        );
    } finally {
      if (task.current === abort) {
        task.current = null;
        setBusy(false);
      }
    }
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.composer.trim()) void makeCards();
  }
  async function speak() {
    if (fixture) {
      setListening(true);
      setTranscript(
        need
          ? "We need tools and volunteers for community planting."
          : "We can offer a workshop and a method for mapping water.",
      );
      return;
    }
    const base = controller.getSnapshot().draft[kind].composer;
    const abort = new AbortController();
    micTask.current = abort;
    setListening(true);
    setNotice("");
    let failed = false;
    try {
      mic.current = await startSpeech(
        language,
        {
          result: (final, interim) => {
            if (abort.signal.aborted) return;
            const text = [base, final, interim].filter(Boolean).join(" ");
            if (text.length > 20000) {
              failed = true;
              abort.abort();
              setListening(false);
              setNotice("This answer reached 20,000 characters. Add it before starting another.");
              return;
            }
            setTranscript([final, interim].filter(Boolean).join(" "));
            update((current) => changeStep(current, { composer: text }, true));
          },
          error: () => {
            failed = true;
            setNotice("The microphone could not continue. Your words are still here; you can type instead.");
          },
          end: () => {
            setListening(false);
            setTranscript("");
            if (!failed && !abort.signal.aborted && controller.getSnapshot().draft[kind].composer.trim())
              void makeCards("voice");
          },
        },
        undefined,
        abort.signal,
      );
    } catch {
      setListening(false);
      if (!abort.signal.aborted) setNotice("Local speech is not ready. Type below or add a card by hand.");
    }
  }
  function stopSpeech() {
    if (fixture) {
      update((current) =>
        changeStep(current, { composer: [current.composer, transcript].filter(Boolean).join(" ") }, true),
      );
      setListening(false);
      setTranscript("");
      void makeCards("voice");
    } else mic.current?.stop();
  }
  function files(input: HTMLInputElement) {
    try {
      const attachments = [...(input.files ?? [])].map((file) => {
        if (file.size > MAX_FILE_BYTES) throw new Error();
        return { id: crypto.randomUUID(), name: file.name, type: file.type, bytes: file.size, blob: file };
      });
      update((current) => addStepFiles(current, attachments));
      if (step.mode === "conversation") void makeCards();
      else setNotice("Files kept on this device. Manual mode does not read their content.");
    } catch {
      setNotice(
        "No files were added. Each file must be 25 MB or smaller and have a name under 256 characters.",
      );
    } finally {
      input.value = "";
    }
  }
  function openEditor(item?: AskItem) {
    setEditorError("");
    update((current) =>
      changeStep(current, { editor: { id: item?.id ?? null, form: formFromAsk(item?.value) } }),
    );
  }
  function saveEditor() {
    try {
      const next = update((current) => keepEditor(current, kind));
      const id = next.items.find((item) => item.id === step.editor?.id)?.id ?? next.items.at(-1)!.id;
      focusIntent.current = `ask-${id}-change`;
      setEditorError("");
      setNotice(need ? "Need kept. You can still change it." : "Offer kept. You can still change it.");
    } catch (error) {
      setEditorError(
        error instanceof Error && !error.message.startsWith("[")
          ? error.message
          : "Add a title and at least one kind. Check amounts, currency and terms; your unfinished values are still here.",
      );
    }
  }
  function next() {
    perform(() => {
      update(reviewStep);
      navigate(fixtureHref(pathTo(need ? "offers" : "finish"), window.location.search, import.meta.env.DEV));
    });
  }
  const editor = step.editor && (
    <AskEditor
      key={step.editor.id ?? "new"}
      kind={kind}
      value={step.editor.form}
      error={editorError}
      onChange={(form) => update((current) => changeStep(current, { editor: { ...current.editor!, form } }))}
      onSave={saveEditor}
      onCancel={() => {
        focusIntent.current = step.editor?.id ? `ask-${step.editor.id}-change` : "add-ask-card";
        update((current) => changeStep(current, { editor: null }));
        setEditorError("");
      }}
    />
  );
  const title = need ? "What does your initiative need?" : "What can your initiative offer?";
  const conversation = (
    <Conversation
      turns={step.turns}
      question={question(step, kind)}
      edits={step.answerEdits}
      onDraftEdit={(id, value) =>
        update((current) =>
          changeStep(
            current,
            { answerEdits: { ...current.answerEdits, [id]: value } },
            value !== (current.answerEdits[id] ?? current.turns.find((turn) => turn.id === id)?.text),
          ),
        )
      }
      onCancel={(id) =>
        update((current) =>
          changeStep(current, {
            answerEdits: Object.fromEntries(
              Object.entries(current.answerEdits).filter(([key]) => key !== id),
            ),
          }),
        )
      }
      onEdit={(id, text) =>
        perform(() => {
          update((current) =>
            changeStep(
              current,
              {
                turns: current.turns.map((turn) => (turn.id === id ? { ...turn, text: text.trim() } : turn)),
                answerEdits: Object.fromEntries(
                  Object.entries(current.answerEdits).filter(([key]) => key !== id),
                ),
              },
              true,
            ),
          );
          if (controller.getSnapshot().draft[kind].mode === "conversation") void makeCards();
        })
      }
    />
  );
  const aside = (
    <section className="rc-stack" aria-labelledby="ask-list-title">
      <div className="rc-ask-head">
        <Heading level={2} size="section" id="ask-list-title">
          {need ? "Your needs" : "Your offers"}
        </Heading>
        <p className="rc-ask-count" aria-live="polite">
          {activeItems(step).length} of {ASK_LIMIT}
        </p>
      </div>
      {step.omitted > 0 && (
        <p className="rc-notice" data-tone="info">
          We heard {step.heard}. These are the first five, including cards you kept. Remove one and make cards
          again to bring in another. Your full words are kept.
        </p>
      )}
      {busy && (
        <p className="rc-guide-status" role="status">
          Making cards on this device
        </p>
      )}
      {!step.items.length && !step.editor && (
        <p className="rc-meta">
          Cards appear here as you add words or files. Up to five; you can also add one by hand.
        </p>
      )}
      <ul className="rc-ask-list" aria-label={need ? "Your needs" : "Your offers"}>
        {step.items.map((item) => (
          <li key={item.id}>
            {step.editor?.id === item.id ? (
              editor
            ) : (
              <AskCard
                item={item}
                kind={kind}
                disabled={busy || !!step.editor}
                onKeep={() =>
                  perform(() => {
                    focusIntent.current = `ask-${item.id}-change`;
                    update((current) => decide(current, item.id, "kept"));
                    setNotice("Card kept.");
                  })
                }
                onChange={() => openEditor(item)}
                onRemove={() =>
                  perform(() => {
                    focusIntent.current = `ask-${item.id}-undo`;
                    update((current) => decide(current, item.id, "removed"));
                    setNotice("Card removed. Undo is available.");
                  })
                }
                onUndo={() =>
                  perform(() => {
                    focusIntent.current = `ask-${item.id}-change`;
                    update((current) => decide(current, item.id, "pencil"));
                  })
                }
              />
            )}
          </li>
        ))}
      </ul>
      {step.editor && !step.editor.id && editor}
      {!step.editor && activeItems(step).length < ASK_LIMIT && (
        <button
          className="rc-button"
          data-variant="quiet"
          type="button"
          id="add-ask-card"
          disabled={busy}
          onClick={() => openEditor()}
        >
          {need ? "Add a need by hand" : "Add an offer by hand"}
        </button>
      )}
      {activeItems(step).length >= ASK_LIMIT && (
        <p className="rc-meta">Five is the limit. Remove one to add another.</p>
      )}
    </section>
  );
  return (
    <Stack>
      <Stepper steps={INTAKE_STEPS.map((step) => step.label)} current={need ? 1 : 2} />
      <Heading level={1} size="page">
        {title}
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
        <StepLayout aside={aside}>
          {(example?.state === "offline" || example?.intake === "offline" || !navigator.onLine) && (
            <p className="rc-notice" data-tone="info">
              You are offline. Your words and cards stay on this device.
            </p>
          )}
          {step.lastBuild?.fallback && (
            <p className="rc-notice" data-tone="warning">
              The browser model could not finish. These are keyword cards, ready for you to check.
            </p>
          )}
          {!!step.lastBuild?.unreadFiles && (
            <p className="rc-meta">
              {step.lastBuild.unreadFiles} files were kept without reading their content. Add any missing
              details by hand.
            </p>
          )}
          {step.lastBuild?.files.some((file) => file.status === "partial") && (
            <p className="rc-meta">
              Some PDF pages had no readable text. Their original bytes are kept on this device.
            </p>
          )}
          {step.mode === "conversation" ? (
            <section
              className="rc-guide rc-conversation-panel"
              aria-label={need ? "Describe your needs" : "Describe your offers"}
            >
              <p className="rc-guide-status">
                Assistant on this device. Guided questions,{" "}
                {draft.assistant === "browser" && !fixture
                  ? "browser model selected with keyword fallback"
                  : "keyword cards"}
                .
              </p>
              {conversation}
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
                <label htmlFor="ask-answer">Type your answer, or edit what you said</label>
                <textarea
                  className="rc-input"
                  id="ask-answer"
                  rows={4}
                  maxLength={20000}
                  value={step.composer}
                  disabled={listening}
                  onChange={(event) =>
                    update((current) => changeStep(current, { composer: event.target.value }, true))
                  }
                />
                <div className="rc-action-bar">
                  <button
                    className="rc-button"
                    data-variant="secondary"
                    type="submit"
                    disabled={busy || listening || !!step.editor || !step.composer.trim()}
                  >
                    Add your answer
                  </button>
                </div>
              </form>
              <div className="rc-action-bar">
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  aria-busy={busy}
                  disabled={
                    busy ||
                    listening ||
                    !!step.editor ||
                    !(step.turns.length || step.composer.trim() || step.attachments.length)
                  }
                  onClick={() => void makeCards()}
                >
                  {step.builtVersion === null ? "Make cards" : "Make cards again"}
                </button>
                {busy && (
                  <button
                    className="rc-button"
                    data-variant="secondary"
                    type="button"
                    onClick={() => {
                      task.current?.abort();
                      if (!task.current) {
                        setBusy(false);
                        setNotice("Example stopped. Your words and cards are still here.");
                      }
                    }}
                  >
                    Cancel making cards
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
                    update((current) => changeStep(current, { mode: "manual" }));
                  }}
                >
                  Use plain cards
                </button>
              </div>
            </section>
          ) : (
            <>
              <p>Add cards by hand. No assistant reads your words or files in this mode.</p>
              {(step.turns.length > 0 || Object.keys(step.answerEdits).length > 0) && (
                <details>
                  <summary className="rc-footer-link">Your earlier words</summary>
                  {conversation}
                </details>
              )}
              <form
                className="rc-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  perform(() => {
                    update((current) => answerStep(current, kind, current.composer));
                    setNotice("Notes kept without making cards.");
                  });
                }}
              >
                <label htmlFor="manual-ask-notes">Notes to keep on this device</label>
                <textarea
                  className="rc-input"
                  id="manual-ask-notes"
                  maxLength={20000}
                  rows={3}
                  value={step.composer}
                  onChange={(event) =>
                    update((current) => changeStep(current, { composer: event.target.value }, true))
                  }
                />
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="submit"
                  disabled={!step.composer.trim()}
                >
                  Keep notes
                </button>
              </form>
              <button
                className="rc-button"
                data-variant="quiet"
                type="button"
                onClick={() => {
                  controller.change((current) =>
                    revise(current, {
                      assistant: "keywords",
                      [kind]: changeStep(current[kind], { mode: "conversation" }),
                    }),
                  );
                }}
              >
                Talk it through instead
              </button>
            </>
          )}
          <div className="rc-field">
            <label htmlFor="ask-files">Add files</label>
            <p className="rc-hint">
              Up to 25 MB each. Readable text and PDF text are read in conversation mode; scanned pages and
              Office files remain unread.
            </p>
            <input
              className="rc-input"
              type="file"
              id="ask-files"
              multiple
              disabled={listening || !!step.editor}
              onChange={(event) => files(event.currentTarget)}
            />
          </div>
          <form
            className="rc-field"
            onSubmit={(event) => {
              event.preventDefault();
              perform(() => {
                update(keepLink);
                setNotice("Link kept on this device. Its page has not been fetched.");
              });
            }}
          >
            <label htmlFor="ask-link">Add a link</label>
            <p className="rc-hint">Its address stays here. The page is not fetched.</p>
            <div className="rc-inline-field">
              <input
                className="rc-input"
                type="url"
                id="ask-link"
                required
                maxLength={2048}
                value={step.pendingLink}
                onChange={(event) =>
                  update((current) => changeStep(current, { pendingLink: event.target.value }, true))
                }
              />
              <button className="rc-button" data-variant="secondary" type="submit">
                Add link
              </button>
            </div>
          </form>
          <AttachmentList
            readOnBuild={step.mode === "conversation"}
            files={step.attachments}
            links={step.links}
            onRemoveFile={(id) =>
              update((current) =>
                changeStep(
                  current,
                  { attachments: current.attachments.filter((file) => file.id !== id) },
                  true,
                ),
              )
            }
            onRemoveLink={(url) =>
              update((current) =>
                changeStep(current, { links: current.links.filter((link) => link !== url) }, true),
              )
            }
          />
          {notice && (
            <p className="rc-meta" role="status">
              {notice}
            </p>
          )}
          {step.builtVersion !== null &&
            step.builtVersion !== step.inputVersion &&
            step.mode === "conversation" && (
              <p className="rc-notice" data-tone="warning">
                Your words changed. Make cards again before continuing; kept cards stay fixed.
              </p>
            )}
          <div className="rc-action-bar">
            <button
              className="rc-button"
              data-variant="primary"
              type="button"
              disabled={busy || listening}
              onClick={next}
            >
              {need ? "Next: what you can offer" : "Finish: see what fits"}
            </button>
            <ButtonLink href={pathTo(need ? "check-card" : "needs")} variant="quiet">
              {need ? "Back to your card" : "Back to your needs"}
            </ButtonLink>
          </div>
        </StepLayout>
      )}
    </Stack>
  );
}

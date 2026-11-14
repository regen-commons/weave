import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { typedCard } from "../describe/check.ts";
import { revise } from "../describe/contracts.ts";
import { MAX_FILE_BYTES, type Turn } from "../describe/source-contracts.ts";
import { availableSpeech, startSpeech } from "../describe/speech.ts";
import { useDraft } from "../describe/use-draft.ts";
import { draftText } from "../describe/view.ts";
import type { FixtureContext } from "../fixtures.ts";
import {
  ASK_KINDS,
  cardsNote,
  changeKind,
  continueBoth,
  entryId,
  kindFocus,
  pencilHint,
  sectionCount,
  talkWaiting,
  type Blocker,
} from "../intake/ask-page.ts";
import { ASK_LIMIT, type AskItem, type AskKind, type AskStep as Step } from "../intake/contracts.ts";
import { addEntry } from "../intake/entries.ts";
import { extractAsks } from "../intake/extract-client.ts";
import {
  activeItems,
  addStepFiles,
  answerStep,
  changeStep,
  commitPending,
  decide,
  formFromAsk,
  keepEditor,
  keepLink,
  question,
  reconcile,
} from "../intake/state.ts";
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, INTAKE_STEPS, pathTo } from "../routes.ts";
import { AskCard } from "../ui/AskCard.tsx";
import { AskEditor } from "../ui/AskEditor.tsx";
import { AttachmentList } from "../ui/AttachmentList.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Conversation } from "../ui/Conversation.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Heading } from "../ui/Heading.tsx";
import { DuplicateNotice } from "../social/DuplicateNotice.tsx";
import { Stack } from "../ui/layouts.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { Stepper } from "../ui/Stepper.tsx";
import { VoiceInput } from "../ui/VoiceInput.tsx";

type Blocked = Partial<Record<AskKind, Blocker>>;

/** Clears one list's blocker once the person has changed that list. */
function unblock(kind: AskKind) {
  return (current: Blocked): Blocked => {
    if (!current[kind]) return current;
    const rest = { ...current };
    delete rest[kind];
    return rest;
  };
}

/**
 * Needs and offers on one page: two lists, each with a quick add, and one Continue that keeps
 * every suggestion still showing. Both routes open this page; the offers route starts at the
 * offers list.
 */
export function AskStep({ kind, fixture: example }: { kind: AskKind; fixture?: FixtureContext }) {
  const { draft, controller, ready, storage, error: storageError } = useDraft();
  const [words, setWords] = useState<Record<AskKind, string>>({ needs: "", offers: "" });
  const [blocked, setBlocked] = useState<Blocked>({});
  const [working, setWorking] = useState<Record<AskKind, boolean>>({ needs: false, offers: false });
  const waiting = working.needs || working.offers;
  useEffect(() => setBlocked(unblock("needs")), [draft.needs, words.needs]);
  useEffect(() => setBlocked(unblock("offers")), [draft.offers, words.offers]);
  useEffect(() => {
    if (!ready || kind !== "offers") return;
    // The app focuses the page heading after this effect, so the offers list waits one frame.
    const frame = requestAnimationFrame(() => {
      const title = document.getElementById("ask-offers-title");
      title?.scrollIntoView({ block: "center" });
      title?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, kind]);
  function next() {
    const current = controller.getSnapshot().draft;
    // A full list shows no quick add, so words left in it cannot hold the page.
    const typed = (entry: AskKind) => (activeItems(current[entry]).length >= ASK_LIMIT ? "" : words[entry]);
    const result = continueBoth(
      { needs: current.needs, offers: current.offers },
      { needs: typed("needs"), offers: typed("offers") },
    );
    if (result.ok) {
      controller.change((latest) => revise(latest, result.steps));
      navigate(fixtureHref(pathTo("your-initiative"), routeSearch(), import.meta.env.DEV));
      return;
    }
    // Rendered now, so the first list that stopped the page can take the focus.
    flushSync(() => setBlocked(result.blocked));
    const first = ASK_KINDS.find((entry) => result.blocked[entry]);
    if (first) document.getElementById(`ask-${first}-blocker`)?.focus();
  }
  return (
    <Stack>
      <Stepper steps={INTAKE_STEPS.map((step) => step.label)} current={1} />
      <Heading level={1} size="page">
        Needs and offers
      </Heading>
      <p>Say or add what would help and what you can share. A few words each is enough.</p>
      {kind === "needs" && <DuplicateNotice />}
      <DraftNotice
        error={storageError}
        text={draftText(draft)}
        conflict={storage === "conflict"}
        onRetry={() => controller.retry()}
      />
      {!ready ? (
        <p role="status">Opening your device draft</p>
      ) : (
        <>
          {(example?.state === "offline" || example?.intake === "offline" || !navigator.onLine) && (
            <p className="rc-notice" data-tone="info">
              You are offline. Your words and cards stay on this device.
            </p>
          )}
          <div className="rc-card-grid">
            {ASK_KINDS.map((entry) => (
              <AskSection
                key={entry}
                kind={entry}
                example={entry === kind ? example : undefined}
                words={words[entry]}
                onWords={(value) => setWords((current) => ({ ...current, [entry]: value }))}
                blocker={blocked[entry]}
                onWorking={(value) =>
                  setWorking((current) => (current[entry] === value ? current : { ...current, [entry]: value }))
                }
              />
            ))}
          </div>
          <div className="rc-action-bar">
            <button
              className="rc-button"
              data-variant="primary"
              type="button"
              disabled={waiting}
              aria-busy={waiting || undefined}
              onClick={next}
            >
              Continue
            </button>
            <ButtonLink href={pathTo(typedCard(draft) ? "initiative" : "check-card")} variant="quiet">
              Back
            </ButtonLink>
          </div>
        </>
      )}
    </Stack>
  );
}

/** One of the page's two lists, with everything that adds to it or changes it. */
function AskSection({
  kind,
  example,
  words,
  onWords,
  blocker,
  onWorking,
}: {
  kind: AskKind;
  /** The example view states, given only to the list the route opened on. */
  example?: FixtureContext;
  /** What is typed in the quick add. The page holds it so Continue can ask about it. */
  words: string;
  onWords(value: string): void;
  /** Why Continue stopped at this list. */
  blocker?: Blocker;
  /** True while this list is making cards or listening, so the page holds Continue. */
  onWorking(value: boolean): void;
}) {
  const { draft, controller, ready, storage, fixture } = useDraft();
  const step = draft[kind];
  const need = kind === "needs";
  const one = need ? "Need" : "Offer";
  const part = (name: string) => `ask-${kind}-${name}`;
  const [notice, setNotice] = useState("");
  const [addError, setAddError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [busy, setBusy] = useState(false);
  const [talk, setTalk] = useState(false);
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
  const full = activeItems(step).length >= ASK_LIMIT;
  const hint = pencilHint(step);
  const stale = cardsNote(step);
  const held = busy || listening;
  // Words that are being spoken or made into cards are not waiting on the person yet.
  const waiting = ready && !held && talkWaiting(step);
  const voiceLead = listening || (speechReady && !full);
  useEffect(() => {
    setBusy(example?.intake === "loading");
    setNotice(
      import.meta.env.DEV && example?.intake === "error"
        ? "The browser model could not finish. These are keyword cards; make cards again or change them by hand."
        : "",
    );
  }, [example?.intake]);
  useEffect(() => {
    if (import.meta.env.DEV && example?.intake === "storage-error" && ready && storage === "saved")
      update((current) =>
        changeStep(
          current,
          { composer: current.composer || "A change that could not be saved." },
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
  useEffect(() => {
    onWorking(held);
  }, [held]);
  // Words waiting in the conversation, or a stop there, open it. Closing it stays the person's call.
  useEffect(() => {
    if (waiting || blocker?.where === "talk") setTalk(true);
  }, [waiting, blocker]);
  function perform(action: () => void): boolean {
    try {
      action();
      setEditorError("");
      return true;
    } catch (error) {
      focusIntent.current = null;
      setNotice(
        error instanceof Error && !error.message.startsWith("[")
          ? error.message
          : "That did not work. Check this list and try again.",
      );
      return false;
    }
  }
  async function makeCards(via: Turn["via"] = "typed") {
    if (controller.getSnapshot().draft[kind].editor) {
      setNotice("Keep or cancel the details you have open before making cards.");
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
            ? "Cards are ready. Dashed ones are suggestions; remove any that are wrong."
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
  /** Speak from the top of the list. Spoken words become cards, so the list uses the assistant on this device. */
  function speakAloud() {
    if (step.mode !== "conversation")
      controller.change((current) =>
        revise(current, {
          assistant: current.assistant === "none" ? "keywords" : current.assistant,
          [kind]: changeStep(current[kind], { mode: "conversation" }),
        }),
      );
    void speak();
  }
  function stopWork() {
    task.current?.abort();
    if (!task.current) {
      setBusy(false);
      setNotice(import.meta.env.DEV ? "Stopped. Your words and cards are still here." : "");
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
      else setNotice("Files kept on this device. Nothing reads their content here.");
    } catch {
      setNotice(
        "No files were added. Each file must be 25 MB or smaller and have a name under 256 characters.",
      );
    } finally {
      input.value = "";
    }
  }
  function openEditor(item: AskItem) {
    setEditorError("");
    update((current) => changeStep(current, { editor: { id: item.id, form: formFromAsk(item.value) } }));
  }
  function saveEditor() {
    const open = step.editor?.id;
    try {
      const next = update((current) => keepEditor(current, kind));
      const kept = next.items.find((item) => item.id === open) ?? next.items.at(-1);
      focusIntent.current = kept ? entryId(kept.id, "more") : part("add");
      setEditorError("");
      setNotice(`${one} details kept.`);
    } catch (error) {
      setEditorError(
        error instanceof Error && !error.message.startsWith("[")
          ? error.message
          : "Add a title. Check amounts, currency and terms; your unfinished values are still here.",
      );
    }
  }
  function quickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let target = part("add");
    // Rendered now: a fifth entry replaces the field, and the line that says so takes the focus.
    flushSync(() => {
      try {
        const before = new Set(step.items.map((item) => item.id));
        const next = update((current) => addEntry(current, words));
        const added = next.items.find((item) => !before.has(item.id));
        onWords("");
        setAddError("");
        // Suggested kinds show dashed, and the line under the list already says to check them.
        setNotice(
          added?.value.capitalForms.length
            ? `${one} added.`
            : `${one} added. Add a kind of support when one fits.`,
        );
        if (activeItems(next).length >= ASK_LIMIT) target = part("status");
      } catch (error) {
        setAddError(
          error instanceof Error && !error.message.startsWith("[")
            ? error.message
            : "That did not work. Try again.",
        );
      }
    });
    document.getElementById(target)?.focus();
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
        focusIntent.current = step.editor?.id ? entryId(step.editor.id, "more") : part("add");
        update((current) => changeStep(current, { editor: null }));
        setEditorError("");
      }}
    />
  );
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
  const extras = (
    <>
      <div className="rc-field">
        <label htmlFor={part("files")}>Add files</label>
        <p className="rc-hint">
          Up to 25 MB each. Readable text and PDF text are read when you talk it through; scanned pages and
          Office files remain unread.
        </p>
        <input
          className="rc-input"
          type="file"
          id={part("files")}
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
        <label htmlFor={part("link")}>Add a link</label>
        <p className="rc-hint">Its address stays here. The page is not fetched.</p>
        <div className="rc-inline-field">
          <input
            className="rc-input"
            type="url"
            id={part("link")}
            required
            maxLength={2048}
            value={step.pendingLink}
            onChange={(event) => update((current) => changeStep(current, { pendingLink: event.target.value }, true))}
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
            changeStep(current, { attachments: current.attachments.filter((file) => file.id !== id) }, true),
          )
        }
        onRemoveLink={(url) =>
          update((current) => changeStep(current, { links: current.links.filter((link) => link !== url) }, true))
        }
      />
    </>
  );
  return (
    <section className="rc-stack" aria-labelledby={part("title")}>
      <div className="rc-ask-head">
        <h2 className="rc-heading" data-size="section" id={part("title")} tabIndex={-1}>
          {need ? "What you need" : "What you can offer"}
        </h2>
        <p className="rc-ask-count" aria-live="polite">
          {sectionCount(step)}
        </p>
      </div>
      {blocker && (
        <p className="rc-notice" data-tone="warning" role="alert" id={part("blocker")} tabIndex={-1}>
          {blocker.message}
        </p>
      )}
      {voiceLead && (
        <VoiceInput
          variant={activeItems(step).length ? "secondary" : "primary"}
          label={need ? "Say what you need" : "Say what you can offer"}
          available={speechReady}
          listening={listening}
          transcript={transcript}
          language={language}
          onLanguage={setLanguage}
          onStart={speakAloud}
          onStop={stopSpeech}
          disabled={busy || !!step.editor}
        />
      )}
      {full ? (
        <p className="rc-meta">Five is the limit. Remove one to add another.</p>
      ) : (
        <form className="rc-field" onSubmit={quickAdd}>
          <label htmlFor={part("add")}>{need ? "Add a need" : "Add an offer"}</label>
          <p className="rc-hint" id={part("add-hint")}>
            {need
              ? "A few words, such as seedlings or a meeting room."
              : "A few words, such as a workshop or tools to lend."}
          </p>
          <div className="rc-inline-field">
            <input
              className="rc-input"
              type="text"
              id={part("add")}
              maxLength={600}
              value={words}
              disabled={held}
              aria-describedby={addError ? `${part("add-hint")} ${part("add-error")}` : part("add-hint")}
              aria-invalid={!!addError || undefined}
              onChange={(event) => {
                onWords(event.target.value);
                setAddError("");
              }}
            />
            <button className="rc-button" data-variant="secondary" type="submit" disabled={held}>
              Add
            </button>
          </div>
          {addError && (
            <p className="rc-error" role="alert" id={part("add-error")}>
              {addError}
            </p>
          )}
        </form>
      )}
      {step.omitted > 0 && (
        <p className="rc-notice" data-tone="info">
          We heard {step.heard}. These are the first five, including cards you kept. Remove one and make cards
          again to bring in another. Your full words are kept.
        </p>
      )}
      {step.lastBuild?.fallback && (
        <p className="rc-notice" data-tone="warning">
          The browser model could not finish. These are keyword cards, ready for you to check.
        </p>
      )}
      {!!step.lastBuild?.unreadFiles && (
        <p className="rc-meta">
          {step.lastBuild.unreadFiles} files were kept without reading their content. Add any missing details
          by hand.
        </p>
      )}
      {step.lastBuild?.files.some((file) => file.status === "partial") && (
        <p className="rc-meta">
          Some PDF pages had no readable text. Their original bytes are kept on this device.
        </p>
      )}
      {busy && (
        <StatusLine
          actions={
            <button className="rc-button" data-variant="secondary" data-size="sm" type="button" onClick={stopWork}>
              Cancel making cards
            </button>
          }
        >
          Making cards on this device
        </StatusLine>
      )}
      {step.items.length > 0 && (
        <ul className="rc-ask-list" aria-label={need ? "Your needs" : "Your offers"}>
          {step.items.map((item) => (
            <li key={item.id}>
              {step.editor?.id === item.id ? (
                editor
              ) : (
                <AskCard
                  item={item}
                  kind={kind}
                  disabled={held || !!step.editor}
                  noteId={hint ? part("hint") : undefined}
                  onKind={(key) =>
                    perform(() => {
                      focusIntent.current = kindFocus(item.id, item.value.capitalForms, key);
                      update((current) => changeKind(current, item.id, key));
                    })
                  }
                  onMore={() => openEditor(item)}
                  onRemove={() =>
                    perform(() => {
                      focusIntent.current = entryId(item.id, "undo");
                      update((current) => decide(current, item.id, "removed"));
                      setNotice("Removed. Undo is available.");
                    })
                  }
                  onUndo={() =>
                    perform(() => {
                      focusIntent.current = entryId(item.id, "more");
                      update((current) => decide(current, item.id, "pencil"));
                      setNotice("");
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {step.editor && !step.editor.id && editor}
      {hint && (
        <p className="rc-meta" id={part("hint")}>
          {hint}
        </p>
      )}
      {notice && (
        <p className="rc-meta" role="status" id={part("status")} tabIndex={-1}>
          {notice}
        </p>
      )}
      {stale && !busy && (
        <p className="rc-notice" data-tone="warning">
          {stale}
        </p>
      )}
      <details open={talk} onToggle={(event) => setTalk(event.currentTarget.open)}>
        <summary className="rc-footer-link">
          {step.mode === "conversation" ? "Longer answers, files and links" : "Notes, files and links"}
        </summary>
        <div className="rc-stack">
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
              {/* Speaking leads the list above. Here the language choice stays reachable when it cannot. */}
              {!voiceLead && !full && (
                <VoiceInput
                  variant="secondary"
                  available={false}
                  listening={false}
                  transcript=""
                  language={language}
                  onLanguage={setLanguage}
                  onStart={speakAloud}
                  onStop={stopSpeech}
                />
              )}
              <form className="rc-composer" onSubmit={add}>
                <label htmlFor={part("answer")}>Type your answer, or edit what you said</label>
                <textarea
                  className="rc-input"
                  id={part("answer")}
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
                    disabled={held || !!step.editor || !step.composer.trim()}
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
                    held ||
                    !!step.editor ||
                    !(step.turns.length || step.composer.trim() || step.attachments.length)
                  }
                  onClick={() => void makeCards()}
                >
                  {step.builtVersion === null ? "Make cards" : "Make cards again"}
                </button>
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
                  Add by hand only
                </button>
              </div>
            </section>
          ) : (
            <>
              <p>No assistant reads your words or files here.</p>
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
                <label htmlFor={part("notes")}>Notes to keep on this device</label>
                <textarea
                  className="rc-input"
                  id={part("notes")}
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
              <div className="rc-action-bar">
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
              </div>
            </>
          )}
          {extras}
        </div>
      </details>
    </section>
  );
}

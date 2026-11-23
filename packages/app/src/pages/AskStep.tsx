import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { revise } from "../describe/contracts.ts";
import { MAX_FILE_BYTES, type Turn } from "../describe/source-contracts.ts";
import { startSpeech } from "../describe/speech.ts";
import type { SpeechSetupStore } from "../describe/speech-setup.ts";
import type { BrowserSpeechConsent } from "../describe/speech-consent.ts";
import { useSpeechSetup } from "../describe/use-speech.ts";
import { speechMode, speechNotStarted, speechPaused, speechProblem } from "../describe/speech-setup.ts";
import { useDraft } from "../describe/use-draft.ts";
import { draftText, previewFields } from "../describe/view.ts";
import { exampleConsent, exampleOutcome, exampleSpeech, type FixtureContext, type SpeechExample } from "../fixtures.ts";
import {
  cardsNote,
  changeKind,
  continueStep,
  entryId,
  kindFocus,
  pencilHint,
  sectionCount,
  type Blocker,
} from "../intake/ask-page.ts";
import { ASK_LIMIT, ASK_LIMIT_HELP, type AskItem, type AskKind, type AskStep as Step } from "../intake/contracts.ts";
import { closeAskReader, extractAsks, warmAskReader } from "../intake/extract-client.ts";
import { spokenList } from "../intake/spoken.ts";
import {
  activeItems,
  addStepFiles,
  changeStep,
  commitPending,
  decide,
  formFromAsk,
  hasEarlierInput,
  keepEditor,
  reconcile,
  returnWords,
  settleEarlierInput,
} from "../intake/state.ts";
import { currentVisit, navigate, routePath, routeSearch } from "../router.tsx";
import { backTarget, fixtureHref, matchRoute, pathTo } from "../routes.ts";
import { AskCard } from "../ui/AskCard.tsx";
import { AskEditor } from "../ui/AskEditor.tsx";
import { AttachmentList } from "../ui/AttachmentList.tsx";
import { BackButton } from "../ui/BackLink.tsx";
import { Dock } from "../ui/Dock.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Heading } from "../ui/Heading.tsx";
import { DuplicateNotice } from "../social/DuplicateNotice.tsx";
import { Stack, StepLayout } from "../ui/layouts.tsx";
import { RecordPreview } from "../ui/RecordPreview.tsx";
import { IntakeStepper } from "../ui/Stepper.tsx";
import { TalkItOut } from "../ui/TalkItOut.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { DraftSkeleton } from "../ui/CardSkeleton.tsx";

/** What each of the two steps asks, in the order the steps come. */
const ASK_STEPS = {
  needs: {
    title: "What You Need",
    intro: "Say or type everything that would help, in one go if you like. Weave makes a card for each need, up to four.",
    next: "offers",
  },
  offers: {
    title: "What You Can Offer",
    intro: "Say or type what you can share with others, in one go if you like. Weave makes a card for each offer, up to four.",
    next: "your-initiative",
  },
} as const;

/**
 * Needs, then offers: two steps, each with one list and one Talk It Out box, and a Continue
 * that keeps every suggestion still showing (DL-111). Nothing opens in the page when pressed: a
 * card's details are changed in a dialog, and progress and problems are written in places that
 * are always there (DL-113).
 */
export function AskStep({ kind, fixture: example }: { kind: AskKind; fixture?: FixtureContext }) {
  const { draft, controller, ready, error: storageError } = useDraft();
  const page = ASK_STEPS[kind];
  const [blocked, setBlocked] = useState<Blocker | undefined>();
  const [waiting, setWaiting] = useState(false);
  const speech = import.meta.env.DEV && example ? exampleSpeech(example.speech) : undefined;
  const consent = import.meta.env.DEV && example ? exampleConsent(example.speech) : undefined;
  // Changing the list clears why Continue stopped at it.
  useEffect(() => setBlocked(undefined), [draft[kind]]);
  // The worker that reads words into cards is kept while the step is open, and ends when the person leaves it.
  useEffect(() => closeAskReader, []);
  function next() {
    const result = continueStep(controller.getSnapshot().draft[kind]);
    if (result.ok) {
      controller.change((latest) => revise(latest, { [kind]: result.step }));
      navigate(fixtureHref(pathTo(page.next), routeSearch(), import.meta.env.DEV));
      return;
    }
    // Rendered now, so the line that says why can take the focus.
    flushSync(() => setBlocked(result.blocker));
    document.getElementById(`ask-${kind}-blocker`)?.focus();
  }
  // The way back is the step before, whichever page the person came from, as the app bar's is.
  const back = backTarget(matchRoute(routePath()), currentVisit());
  /** The step's way forward: in the Step bar on a wide screen, in the dock on a phone (DL-089). */
  const forward = (from?: "wide") => (
    <button
      className="rc-button"
      data-variant="primary"
      data-from={from}
      type="button"
      disabled={waiting}
      aria-busy={waiting || undefined}
      onClick={next}
    >
      Continue
    </button>
  );
  return (
    <Stack>
      {/* On a wide screen the way back and the way forward are in the Step bar, beside the steps (DL-127). */}
      <IntakeStepper>
        {back && <BackButton target={back}>Back</BackButton>}
        {forward("wide")}
      </IntakeStepper>
      <Heading level={1} size="page">
        {page.title}
      </Heading>
      <p>{page.intro}</p>
      {kind === "needs" && <DuplicateNotice />}
      <DraftNotice error={storageError} text={draftText(draft)} onRetry={() => controller.retry()} />
      {!ready ? (
        <DraftSkeleton />
      ) : (
        // One list in the step's column, with the card beside it on a wide screen, as on step 1.
        <StepLayout asideFrom="wide" aside={<RecordPreview fields={previewFields(draft)} confirmed={!!draft.confirmed} />}>
          {(example?.state === "offline" || example?.intake === "offline" || !navigator.onLine) && (
            <p className="rc-notice" data-tone="info">
              You are offline. Your words and cards stay on this device.
            </p>
          )}
          <AskSection
            key={kind}
            kind={kind}
            example={example}
            blocker={blocked}
            speech={speech}
            consent={consent}
            speechExample={example?.speech}
            onWorking={setWaiting}
          />
          {/* A phone keeps the way back at the end of the step, above the docked way forward. */}
          <div className="rc-action-bar" data-until="wide">
            {back && <BackButton target={back}>Back</BackButton>}
          </div>
          <Dock>{forward()}</Dock>
        </StepLayout>
      )}
    </Stack>
  );
}

/** The step's list, with everything that adds to it or changes it. */
function AskSection({
  kind,
  example,
  blocker,
  speech: speechStore,
  consent,
  speechExample = "ready",
  onWorking,
}: {
  kind: AskKind;
  /** The example view states, given only to the list the route opened on. */
  example?: FixtureContext;
  /** Why Continue stopped at this list. */
  blocker?: Blocker;
  /** The example world's speech, or this browser's when it is not given. */
  speech?: SpeechSetupStore;
  /** The example world's agreement to browser speech, or this browser's when it is not given. */
  consent?: BrowserSpeechConsent;
  /** Which example browser the page shows, so an example session can fail the way it would. */
  speechExample?: SpeechExample;
  /** True while this list is making cards or listening, so the page holds Continue. */
  onWorking(value: boolean): void;
}) {
  const { draft, controller, ready, error: storageError, fixture } = useDraft();
  const step = draft[kind];
  const need = kind === "needs";
  const one = need ? "Need" : "Offer";
  const part = (name: string) => `ask-${kind}-${name}`;
  const [notice, setNotice] = useState("");
  const [editorError, setEditorError] = useState("");
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState(navigator.language || "en-US");
  const speech = useSpeechSetup(language, speechStore, consent);
  const [listening, setListening] = useState(false);
  const task = useRef<AbortController | null>(null);
  const mic = useRef<{ stop(): void; dispose(): void } | null>(null);
  const micTask = useRef<AbortController | null>(null);
  const focusIntent = useRef<string | null>(null);
  /** What the box held when listening began, so only what was said after it is split into lines. */
  const heardAfter = useRef("");
  // Words the recognizer may still change. They show in the box and reach the draft only once
  // settled, or when listening ends, so a phone does not store the draft five times a second.
  const [heard, setHeard] = useState("");
  const unsettled = useRef("");
  // Stop pressed before the recognizer has started is kept, and applied once it has.
  const stopWanted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const addFiles = useRef<HTMLButtonElement>(null);
  const update = (change: (step: Step) => Step) =>
    controller.change((current) => revise(current, { [kind]: change(current[kind]) }))[kind];
  const full = activeItems(step).length >= ASK_LIMIT;
  const hint = pencilHint(step);
  const stale = cardsNote(step);
  const held = busy || listening;
  useEffect(() => {
    setBusy(example?.intake === "loading");
    setNotice(
      import.meta.env.DEV && example?.intake === "error"
        ? "The browser model could not finish. These are keyword cards. Check them, or add to the list again."
        : "",
    );
  }, [example?.intake]);
  useEffect(() => {
    if (import.meta.env.DEV && example?.intake === "storage-error" && ready && !storageError)
      update((current) => changeStep(current, { composer: current.composer || "A change that could not be saved." }));
  }, [example?.intake, ready, storageError]);
  useEffect(
    () => () => {
      task.current?.abort();
      micTask.current?.abort();
      mic.current?.dispose();
    },
    [controller, kind],
  );
  // What the earlier guided conversation left open is settled once, so nothing hidden holds the page.
  const earlier = hasEarlierInput(step);
  useEffect(() => {
    if (ready && earlier) update(settleEarlierInput);
  }, [ready, earlier]);
  useEffect(() => {
    if (focusIntent.current) {
      document.getElementById(focusIntent.current)?.focus();
      focusIntent.current = null;
    }
  }, [step.editor, step.items]);
  useEffect(() => {
    onWorking(held);
  }, [held]);
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
  /** Reads the words in the box, and any files, into cards on this device. Up to four fit the list. */
  async function addToList(via: Turn["via"] = "typed") {
    micTask.current?.abort();
    mic.current?.dispose();
    setListening(false);
    const draftId = controller.getSnapshot().draft.id;
    const before = new Set(controller.getSnapshot().draft[kind].turns.map((turn) => turn.id));
    let source: Step;
    try {
      // The words are read on this device, so the list uses the reader whatever it used before.
      source = controller.change((current) =>
        revise(current, {
          assistant: current.assistant === "none" ? "keywords" : current.assistant,
          [kind]: commitPending(changeStep(current[kind], { mode: "conversation" }), kind, via),
        }),
      )[kind];
    } catch {
      setNotice("Those words could not be added. They are still in the box.");
      return;
    }
    const added = source.turns.find((turn) => !before.has(turn.id))?.id;
    const known = new Set(source.items.map((item) => item.sourceKey));
    const abort = new AbortController();
    task.current?.abort();
    task.current = abort;
    setBusy(true);
    setNotice("");
    const started = performance.now();
    try {
      const result = await extractAsks(
        source,
        kind,
        abort.signal,
        controller.getSnapshot().draft.assistant === "browser" && !fixture,
      );
      abort.signal.throwIfAborted();
      // The cards belong to the draft whose words were read. If the tab has moved to another, they are dropped.
      if (controller.getSnapshot().draft.id !== draftId) return;
      const read = controller.change((current) => {
        return revise(current, {
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
        });
      })[kind];
      if (task.current === abort) {
        const unread = result.lastBuild.unreadFiles;
        // Says how many, so a list said in one go can be checked against what was said.
        const fresh = read.items.filter((item) => item.decision === "pencil" && !known.has(item.sourceKey)).length;
        setNotice(
          [
            !result.extraction.heard
              ? "No new cards were found in those words. Your list is unchanged."
              : read.omitted > 0
                ? "The list holds four, so not everything fit. Remove one and add again to bring in another."
                : `${fresh ? `${fresh} ${one.toLowerCase()}${fresh === 1 ? "" : "s"} added.` : "Added."} Dashed cards and kinds are suggestions. Remove any that are wrong.`,
            result.lastBuild.fallback ? "The browser model could not finish, so these are keyword cards." : "",
            unread ? `${unread} ${unread === 1 ? "file was" : "files were"} kept but not read.` : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    } catch (error) {
      const cancelled = abort.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      // The words go back to the draft they came from, and never into another one.
      if (controller.getSnapshot().draft.id === draftId) controller.change((current) =>
        revise(current, {
          // The words go back into the box, so nothing waits on words the person cannot see.
          [kind]: added ? returnWords(current[kind], added) : current[kind],
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
            ? "Stopped. Your words are back in the box."
            : "Weave could not read those words on this device. They are back in the box. Try again.",
        );
    } finally {
      if (task.current === abort) {
        task.current = null;
        setBusy(false);
        // Add To List is held once the box is empty, so the press can leave nothing holding the
        // focus. The line that says what happened takes it then, and a keyboard goes on from there (DL-032).
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) document.getElementById(part("blocker"))?.focus();
        });
      }
    }
  }
  /**
   * What was just said goes into the box one need or offer a line, after what was there before,
   * so a list said in one go is read into a card for each thing in it. False when nothing but
   * sounds of thinking was said, which leaves the box as it was before.
   */
  function listSaid(base: string): boolean {
    const box = controller.getSnapshot().draft[kind].composer;
    // Words changed in the box while it listened are read with the rest.
    const before = box.startsWith(base) ? base.trimEnd() : "";
    const lines = spokenList(box.startsWith(base) ? box.slice(base.length) : box);
    try {
      update((current) => changeStep(current, { composer: [before, lines].filter(Boolean).join("\n") }));
    } catch {
      // A box that cannot take the lines keeps the words as they were said.
    }
    return !!lines;
  }
  async function talk() {
    setNotice("");
    const mode = speechMode(speech.state);
    if (!mode) return;
    const base = controller.getSnapshot().draft[kind].composer;
    heardAfter.current = base;
    // An example pretends to listen, in a development-only branch that production drops.
    if (import.meta.env.DEV && fixture) {
      const outcome = exampleOutcome(speechExample);
      if (outcome === "pause") {
        setNotice(speechPaused(Boolean(base.trim())));
        return;
      }
      if (outcome) {
        setNotice(speechProblem(outcome, mode, speech.touch));
        return;
      }
      setListening(true);
      // A list said in one go, as a recognizer without punctuation writes it.
      const said = need
        ? "um we need native seedlings and a water pump and we also need volunteers for planting day"
        : "we can offer a workshop on water mapping uh and we can lend tools for planting";
      update((current) => changeStep(current, { composer: [base, said].filter(Boolean).join(" ") }));
      return;
    }
    warmAskReader();
    mic.current?.dispose();
    mic.current = null;
    stopWanted.current = false;
    const abort = new AbortController();
    micTask.current = abort;
    setListening(true);
    let failed = false;
    let settled = "";
    /** Puts the words still unsettled into the box after the settled ones, when they fit. */
    const keepUnsettled = () => {
      const words = unsettled.current;
      unsettled.current = "";
      setHeard("");
      const text = [base, settled, words].filter(Boolean).join(" ");
      if (words && text.length <= 20000) update((current) => changeStep(current, { composer: text }));
    };
    try {
      mic.current = await startSpeech(
        mode,
        language,
        {
          result: (final, interim) => {
            if (abort.signal.aborted) return;
            const text = [base, final, interim].filter(Boolean).join(" ");
            if (text.length > 20000) {
              failed = true;
              keepUnsettled();
              abort.abort();
              setListening(false);
              setNotice("That is as much as the box holds. Add it to the list before saying more.");
              return;
            }
            unsettled.current = interim;
            setHeard(interim);
            if (final !== settled) {
              settled = final;
              update((current) => changeStep(current, { composer: [base, final].filter(Boolean).join(" ") }));
            }
          },
          error: (code) => {
            failed = true;
            setNotice(speechProblem(code, mode, speech.touch));
          },
          end: (requested) => {
            // A session cut off at Stop's deadline ends with its last words unsettled; they are kept.
            if (!abort.signal.aborted) keepUnsettled();
            setListening(false);
            if (failed || abort.signal.aborted) return;
            // Stop adds what was said, one card for each thing in it. A recognizer that ended by
            // itself leaves the words in the box, a line for each thing, to go on or add.
            const heard = listSaid(base);
            if (!requested) setNotice(speechPaused(!!controller.getSnapshot().draft[kind].composer.trim()));
            else if (!heard) setNotice(speechProblem("no-speech", mode, speech.touch));
            else void addToList("voice");
          },
        },
        { consent: speech.consent, signal: abort.signal },
      );
      if (stopWanted.current) {
        stopWanted.current = false;
        mic.current.stop();
      }
    } catch {
      setListening(false);
      if (!abort.signal.aborted) setNotice(speechNotStarted(mode));
      speech.check();
    }
  }
  function stop() {
    if (import.meta.env.DEV && fixture) {
      setListening(false);
      if (listSaid(heardAfter.current)) void addToList("voice");
    } else if (mic.current) mic.current.stop();
    else stopWanted.current = true;
  }
  function files(input: HTMLInputElement) {
    const selected = [...(input.files ?? [])];
    if (!selected.length) return;
    try {
      const attachments = selected.map((file) => {
        if (file.size > MAX_FILE_BYTES) throw new Error();
        return { id: crypto.randomUUID(), name: file.name, type: file.type, bytes: file.size, blob: file };
      });
      update((current) => addStepFiles(current, attachments));
      void addToList();
    } catch {
      setNotice("No files were added. Each file must be 25 MB or smaller and have a name under 256 characters.");
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
      focusIntent.current = kept ? entryId(kept.id, "more") : null;
      setEditorError("");
      setNotice(`${one} details kept.`);
    } catch (error) {
      setEditorError(
        error instanceof Error && !error.message.startsWith("[")
          ? error.message
          : "Add a title. Check amounts, currency and terms. Your unfinished values are still here.",
      );
    }
  }
  function cancelEditor() {
    focusIntent.current = step.editor?.id ? entryId(step.editor.id, "more") : null;
    update((current) => changeStep(current, { editor: null }));
    setEditorError("");
  }
  return (
    <section className="rc-panel" aria-labelledby={part("title")}>
      <div className="rc-ask-head">
        <h2 className="rc-heading" data-size="section" id={part("title")} tabIndex={-1}>
          {need ? "Your Needs" : "Your Offers"}
        </h2>
        {/* Not a live region: each change to the list says what happened in the status line, so the
            count would be a second announcement of the same change, without its noun (WCAG 4.1.3). */}
        <p className="rc-ask-count">{sectionCount(step)}</p>
      </div>
      <TalkItOut
        speech={speech}
        listening={listening}
        language={language}
        onLanguage={setLanguage}
        onStart={() => void talk()}
        onStop={stop}
        value={heard ? [step.composer, heard].filter(Boolean).join(" ") : step.composer}
        onChange={(text) => {
          warmAskReader();
          // A change typed while listening already holds the unsettled words it was shown.
          unsettled.current = "";
          setHeard("");
          update((current) => changeStep(current, { composer: text }));
        }}
        boxLabel={need ? "What you need, said or typed" : "What you can offer, said or typed"}
        hint={
          need
            ? "A few words each, such as seedlings or a meeting room."
            : "A few words each, such as a workshop or tools to lend."
        }
        rows={3}
        actionLabel="Add To List"
        workingLabel="Stop Adding"
        working={busy}
        onAction={() => void addToList()}
        onCancel={() => task.current?.abort()}
        status={busy ? "Reading your words on this device." : notice || stale || (full ? ASK_LIMIT_HELP : "")}
        // Why Continue stopped here takes the same line, which is always there, so it pushes nothing down.
        problem={blocker?.message}
        statusId={part("blocker")}
        disabled={full}
        actionReady={!!stale}
      />
      {step.items.length > 0 && (
        <ul className="rc-ask-list" aria-label={need ? "Your needs" : "Your offers"}>
          {step.items.map((item) => (
            <li key={item.id}>
              <AskCard
                item={item}
                kind={kind}
                disabled={held}
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
                    setNotice("Removed. Undo is on the card.");
                  })
                }
                onUndo={() =>
                  perform(() => {
                    focusIntent.current = entryId(item.id, "more");
                    update((current) => decide(current, item.id, "pencil"));
                    setNotice("Back on the list.");
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
      {hint && (
        <p className="rc-meta" id={part("hint")}>
          {hint}
        </p>
      )}
      <div className="rc-action-bar">
        <button
          className="rc-button"
          data-variant="quiet"
          data-size="sm"
          type="button"
          ref={addFiles}
          disabled={held || full}
          onClick={() => fileInput.current?.click()}
        >
          Add Files
        </button>
        {/* The button opens the file picker directly. The input itself is not drawn. */}
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          tabIndex={-1}
          aria-label={need ? "Add files to your needs" : "Add files to your offers"}
          onChange={(event) => files(event.currentTarget)}
        />
      </div>
      <AttachmentList
        files={step.attachments}
        links={step.links}
        onRemoveFile={(id) =>
          update((current) => changeStep(current, { attachments: current.attachments.filter((file) => file.id !== id) }))
        }
        onRemoveLink={(url) =>
          update((current) => changeStep(current, { links: current.links.filter((link) => link !== url) }))
        }
        afterLast={addFiles}
      />
      {/* A card's details are changed over the page, so the list under it stays where it is. */}
      <TaskDialog
        title={step.editor?.id ? (need ? "Change This Need" : "Change This Offer") : need ? "Add A Need" : "Add An Offer"}
        open={!!step.editor}
        onClose={cancelEditor}
      >
        {step.editor && (
          <AskEditor
            key={step.editor.id ?? "new"}
            kind={kind}
            value={step.editor.form}
            error={editorError}
            onChange={(form) => update((current) => changeStep(current, { editor: { ...current.editor!, form } }))}
            onSave={saveEditor}
            onCancel={cancelEditor}
          />
        )}
      </TaskDialog>
    </section>
  );
}

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
import { draftText } from "../describe/view.ts";
import { exampleConsent, exampleOutcome, exampleSpeech, type FixtureContext, type SpeechExample } from "../fixtures.ts";
import {
  ASK_KINDS,
  cardsNote,
  changeKind,
  continueBoth,
  entryId,
  kindFocus,
  pencilHint,
  sectionCount,
  speechSetupList,
  type Blocker,
} from "../intake/ask-page.ts";
import { ASK_LIMIT, ASK_LIMIT_HELP, type AskItem, type AskKind, type AskStep as Step } from "../intake/contracts.ts";
import { extractAsks } from "../intake/extract-client.ts";
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
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo } from "../routes.ts";
import { AskCard } from "../ui/AskCard.tsx";
import { AskEditor } from "../ui/AskEditor.tsx";
import { AttachmentList } from "../ui/AttachmentList.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Dock } from "../ui/Dock.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Heading } from "../ui/Heading.tsx";
import { DuplicateNotice } from "../social/DuplicateNotice.tsx";
import { Stack } from "../ui/layouts.tsx";
import { IntakeStepper } from "../ui/Stepper.tsx";
import { TalkItOut } from "../ui/TalkItOut.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { DraftSkeleton } from "../ui/CardSkeleton.tsx";

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
 * Needs and offers on one page: two lists, each with one Talk it out box, and one Continue that
 * keeps every suggestion still showing (DL-110, DL-111). Both routes open this page; the offers
 * route starts at the offers list. Nothing opens in the page when pressed: a card's details
 * are changed in a dialog, and progress and problems are written in places that are always there.
 */
export function AskStep({ kind, fixture: example }: { kind: AskKind; fixture?: FixtureContext }) {
  const { draft, controller, ready, error: storageError } = useDraft();
  const [blocked, setBlocked] = useState<Blocked>({});
  const [working, setWorking] = useState<Record<AskKind, boolean>>({ needs: false, offers: false });
  const waiting = working.needs || working.offers;
  const speech = import.meta.env.DEV && example ? exampleSpeech(example.speech) : undefined;
  const consent = import.meta.env.DEV && example ? exampleConsent(example.speech) : undefined;
  const setupList = speechSetupList(kind, draft);
  useEffect(() => setBlocked(unblock("needs")), [draft.needs]);
  useEffect(() => setBlocked(unblock("offers")), [draft.offers]);
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
    const result = continueBoth({ needs: current.needs, offers: current.offers });
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
  /** The step's way forward: in its place on a wide screen, in the dock on a phone (DL-089). */
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
      {/* On a wide screen the way back and the way forward are in the Step bar, beside the steps (DL-124). */}
      <IntakeStepper current={1}>
        <ButtonLink href={pathTo("initiative")} variant="quiet">
          Back
        </ButtonLink>
        {forward("wide")}
      </IntakeStepper>
      <Heading level={1} size="page">
        Needs And Offers
      </Heading>
      <p>Say or type what would help and what you can share. A few words each is enough, up to four of each.</p>
      {kind === "needs" && <DuplicateNotice />}
      <DraftNotice error={storageError} text={draftText(draft)} onRetry={() => controller.retry()} />
      {!ready ? (
        <DraftSkeleton />
      ) : (
        <>
          {(example?.state === "offline" || example?.intake === "offline" || !navigator.onLine) && (
            <p className="rc-notice" data-tone="info">
              You are offline. Your words and cards stay on this device.
            </p>
          )}
          {/* The two lists share the row on a wide screen. */}
          <div className="rc-card-grid" data-layout="pair">
            {ASK_KINDS.map((entry) => (
              <AskSection
                key={entry}
                kind={entry}
                example={entry === kind ? example : undefined}
                blocker={blocked[entry]}
                speech={speech}
                consent={consent}
                speechExample={example?.speech}
                // One list offers the speech setup and says when the browser has no speech; the other stays quiet.
                hostsSetup={entry === (setupList ?? kind)}
                onWorking={(value) =>
                  setWorking((current) => (current[entry] === value ? current : { ...current, [entry]: value }))
                }
              />
            ))}
          </div>
          {/* A phone keeps the way back at the end of the step, above the docked way forward. */}
          <div className="rc-action-bar" data-until="wide">
            <ButtonLink href={pathTo("initiative")} variant="quiet">
              Back
            </ButtonLink>
          </div>
          <Dock>{forward()}</Dock>
        </>
      )}
    </Stack>
  );
}

/** One of the page's two lists, with everything that adds to it or changes it. */
function AskSection({
  kind,
  example,
  blocker,
  speech: speechStore,
  consent,
  speechExample = "ready",
  hostsSetup,
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
  /** This list is the one that offers to set up speech for the page. */
  hostsSetup: boolean;
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
  const fileInput = useRef<HTMLInputElement>(null);
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
        setNotice(
          [
            !result.extraction.heard
              ? "No new cards were found in those words. Your list is unchanged."
              : read.omitted > 0
                ? "The list holds four, so not everything fit. Remove one and add again to bring in another."
                : "Added. Dashed cards and kinds are suggestions. Remove any that are wrong.",
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
      }
    }
  }
  async function talk() {
    setNotice("");
    const mode = speechMode(speech.state);
    if (!mode) return;
    const base = controller.getSnapshot().draft[kind].composer;
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
      const said = need
        ? "We need tools and volunteers for community planting."
        : "We can offer a workshop and a method for mapping water.";
      update((current) => changeStep(current, { composer: [base, said].filter(Boolean).join(" ") }));
      return;
    }
    const abort = new AbortController();
    micTask.current = abort;
    setListening(true);
    let failed = false;
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
              abort.abort();
              setListening(false);
              setNotice("That is as much as the box holds. Add it to the list before saying more.");
              return;
            }
            update((current) => changeStep(current, { composer: text }));
          },
          error: (code) => {
            failed = true;
            setNotice(speechProblem(code, mode, speech.touch));
          },
          end: (requested) => {
            setListening(false);
            if (failed || abort.signal.aborted) return;
            // Stop adds what was said. A recognizer that ended by itself leaves any words in the box.
            const said = controller.getSnapshot().draft[kind].composer.trim();
            if (!requested) setNotice(speechPaused(Boolean(said)));
            else if (said) void addToList("voice");
          },
        },
        { consent: speech.consent, signal: abort.signal },
      );
    } catch {
      setListening(false);
      if (!abort.signal.aborted) setNotice(speechNotStarted(mode));
      speech.check();
    }
  }
  function stop() {
    if (import.meta.env.DEV && fixture) {
      setListening(false);
      void addToList("voice");
    } else mic.current?.stop();
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
          {need ? "What You Need" : "What You Can Offer"}
        </h2>
        <p className="rc-ask-count" aria-live="polite">
          {sectionCount(step)}
        </p>
      </div>
      <TalkItOut
        speech={speech}
        secondary={!hostsSetup}
        listening={listening}
        language={language}
        onLanguage={setLanguage}
        onStart={() => void talk()}
        onStop={stop}
        value={step.composer}
        onChange={(text) => update((current) => changeStep(current, { composer: text }))}
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
                    setNotice("");
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

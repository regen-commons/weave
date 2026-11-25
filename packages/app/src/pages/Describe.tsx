import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { MAX_FILE_BYTES, newDraft, revise, type DeviceDraft, type FieldKey, type RecordForm } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import {
  FieldsProblem,
  SAID_LIMIT,
  boxNote,
  changeSaid,
  continueDescribe,
  editFields,
  fieldsForm,
  fillFields,
  fillSummary,
  readingNote,
  saidText,
} from "../describe/fill.ts";
import { closeKeywordReader, keywordExtract, warmKeywordReader } from "../describe/keyword-client.ts";
import { cloudSession } from "../describe/speech-cloud.ts";
import { startSpeech, type SpeechProblem } from "../describe/speech.ts";
import { deviceEngines, ledgerRows, structureWords } from "../describe/structure.ts";
import { useSpeechSetup } from "../describe/use-speech.ts";
import { isCloudSpeechLimit, speechMode, speechNotStarted, speechPaused, speechProblem, talksHere } from "../describe/speech-setup.ts";
import { draftText, previewFields } from "../describe/view.ts";
import { exampleConsent, exampleOutcome, exampleSpeech, type FixtureContext } from "../fixtures.ts";
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo } from "../routes.ts";
import { AttachmentList } from "../ui/AttachmentList.tsx";
import { revealProblem } from "../ui/dock.ts";
import { Dock } from "../ui/Dock.tsx";
import { moveOnEnter } from "../ui/next-field.ts";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Heading } from "../ui/Heading.tsx";
import { Panel, StepLayout, Stack } from "../ui/layouts.tsx";
import { RecordFields } from "../ui/RecordFields.tsx";
import { RecordPreview } from "../ui/RecordPreview.tsx";
import { IntakeStepper } from "../ui/Stepper.tsx";
import { TalkItOut } from "../ui/TalkItOut.tsx";
import { DescribeExamples } from "./DescribeExamples.tsx";
import { useSocialFixture } from "../social/context.tsx";
import { publicFacts } from "../social/words.ts";
import { fullDate } from "../home.ts";
import { afterInitiative, publicCard } from "../initiative/status.ts";
import { Facts } from "../ui/Facts.tsx";
import { useAccountDoor } from "../account/door.tsx";

const FIELDS_ID = "describe-fields";
const PROBLEM_ID = "describe-problem";

/** What to say, shown as the box's hint: the shape the name, the place and the description are read from. */
const SAY_EXAMPLE = "For example: We are River Keepers, based in Nairobi. We restore the riverbank.";

/**
 * The describe step, on one page (DL-110). Talk it out leads: the person says or types a few
 * sentences in one box, and Weave fills the fields under it in place, on this device: the name,
 * where they work and what they do. A file added beside the box is read at once for the same
 * three. The fields stay editable, the link is the person's own to give, and one Continue goes
 * on to needs and offers: in the Step bar on a wide screen and in the dock on a phone (DL-127).
 * Nothing here opens, closes or moves when it is pressed.
 */
export function Describe({
  fixture: examples,
  starting = false,
}: {
  fixture?: FixtureContext;
  /**
   * Shown by the address that starts a new card, before the card exists: the same step, blank and
   * not yet taking input, so the step is on screen at once and nothing moves when the new card
   * opens in its place. The tab's earlier draft is never shown here.
   */
  starting?: boolean;
}) {
  const live = useDraft();
  const [blank] = useState(newDraft);
  const draft = starting ? blank : live.draft;
  const ready = live.ready && !starting;
  const { error: storageError, controller, fixture } = live;
  const social = useSocialFixture();
  const openDoor = useAccountDoor();
  const [language, setLanguage] = useState(navigator.language || "en-US");
  const speech = useSpeechSetup(
    language,
    import.meta.env.DEV && examples ? exampleSpeech(examples.speech) : undefined,
    import.meta.env.DEV && examples ? exampleConsent(examples.speech) : undefined,
  );
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [speechLimitNotice, setSpeechLimitNotice] = useState("");
  const [fileNote, setFileNote] = useState("");
  // What stopped Continue: about one field, where it is then written, or about the form as a whole.
  const [problem, setProblem] = useState<{ field?: FieldKey; message: string } | null>(null);
  const task = useRef<AbortController | null>(null);
  const mic = useRef<{ stop(): void; dispose(): void } | null>(null);
  const micTask = useRef<AbortController | null>(null);
  // Words the recognizer may still change. They show in the box and reach the draft only once
  // settled, or when listening ends, so a phone does not store the draft five times a second.
  const [heard, setHeard] = useState("");
  const unsettled = useRef("");
  // Stop pressed before the recognizer has started is kept, and applied once it has.
  const stopWanted = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const addFilesRef = useRef<HTMLButtonElement>(null);
  const view = examples?.describe;
  // A card linked to a Certified project lists its four public details read-only: the project owns them.
  const linked = import.meta.env.DEV && social?.state.identity ? social.state.project : null;
  const form = fieldsForm(draft);
  const said = saidText(draft);
  useEffect(() => {
    setWorking(view === "building");
    setListening(view === "listening");
    setSpeechLimitNotice("");
    setStatus(
      view === "speech-error" ? "The microphone did not work. Your words are still here, and you can type in the box." : "",
    );
    setProblem(null);
    return () => {
      task.current?.abort();
      task.current = null;
      micTask.current?.abort();
      mic.current?.dispose();
    };
  }, [controller, view]);
  useEffect(() => {
    if (import.meta.env.DEV && view === "storage-error" && ready && !storageError)
      controller.change((current) => changeSaid(current, saidText(current) || "A change that could not be saved."));
  }, [controller, view, ready, storageError]);
  // The keyword worker is kept while the step is open, and ends when the person leaves it.
  useEffect(() => closeKeywordReader, []);
  function changeForm(value: RecordForm) {
    setProblem(null);
    controller.change((current) => editFields(current, value));
  }
  /** Structures the words in the box, and any files, into the fields, on this device. */
  async function fill() {
    micTask.current?.abort();
    mic.current?.dispose();
    setListening(false);
    const source = controller.getSnapshot().draft;
    if (!saidText(source).trim() && !source.attachments.length) {
      setStatus("Say or type a few sentences first.");
      return;
    }
    const abort = new AbortController();
    task.current?.abort();
    task.current = abort;
    setWorking(true);
    // Reading a long file takes a moment, so the page says what it is doing while it does.
    setStatus(readingNote(!!saidText(source).trim(), source.attachments.length));
    const started = performance.now();
    try {
      // An example runs the keyword rules only, so it never depends on the browser it is shown in.
      // The browser is asked about its model while the keyword rules run, not before them.
      const engines = fixture ? [] : deviceEngines();
      const result = await structureWords(source, abort.signal, { keywords: keywordExtract, engines });
      abort.signal.throwIfAborted();
      // The result belongs to the draft whose words were read. If the tab has moved to another, it is dropped.
      if (controller.getSnapshot().draft.id !== source.id) return;
      let summary = "";
      controller.change((current) => {
        const filled = fillFields(current, result.suggestion, result.lastBuild, saidText(source));
        summary = fillSummary(filled);
        return revise(filled.draft, {
          runs: [...filled.draft.runs, ...ledgerRows("initiative", result.attempts, result.words)],
        });
      });
      const unread = result.lastBuild.unreadFiles;
      if (task.current === abort)
        setStatus(unread ? `${summary} ${unread} ${unread === 1 ? "file was" : "files were"} kept but not read.` : summary);
    } catch (failure) {
      const cancelled = abort.signal.aborted || (failure instanceof DOMException && failure.name === "AbortError");
      // The ledger row is that draft's too, and is never written into another one.
      if (controller.getSnapshot().draft.id === source.id) controller.change((current) =>
        revise(current, {
          runs: [
            ...current.runs,
            ...ledgerRows(
              "initiative",
              [
                {
                  engine: "keywords",
                  model: "Keyword draft",
                  status: cancelled ? "cancelled" : "failed",
                  latencyMs: Math.max(0, Math.round(performance.now() - started)),
                },
              ],
              0,
            ),
          ],
        }),
      );
      if (task.current === abort)
        setStatus(
          cancelled
            ? "Stopped. Your words are still in the box."
            : "Weave could not read your words on this device. They are still in the box, and you can type in the fields.",
        );
    } finally {
      if (task.current === abort) {
        task.current = null;
        setWorking(false);
      }
    }
  }
  async function talk() {
    setStatus("");
    setSpeechLimitNotice("");
    setProblem(null);
    const mode = speechMode(speech.state);
    if (!mode) return;
    const showSpeechProblem = (code: SpeechProblem, retryAt?: number) => {
      if (cloudSession.rememberLimit(code, retryAt)) return;
      const message = speechProblem(code, mode, speech.touch, retryAt);
      if (isCloudSpeechLimit(code)) setSpeechLimitNotice(message);
      else setStatus(message);
    };
    const base = saidText(controller.getSnapshot().draft);
    // An example pretends to listen. The words are written here, inside the development-only
    // branch, so no example content reaches the production bundle.
    if (import.meta.env.DEV && fixture) {
      const outcome = exampleOutcome(examples?.speech ?? "ready");
      if (outcome === "pause") {
        setStatus(speechPaused(Boolean(base.trim())));
        return;
      }
      if (outcome) {
        showSpeechProblem(outcome);
        return;
      }
      const said = "We are Orchard learning circle. Families share what they learn about the orchard.";
      setListening(true);
      controller.change((current) => changeSaid(current, [base, said].filter(Boolean).join(" ")));
      return;
    }
    warmKeywordReader();
    mic.current?.dispose();
    mic.current = null;
    stopWanted.current = false;
    const abort = new AbortController();
    micTask.current = abort;
    setListening(true);
    let failed = false;
    let settled = "";
    /** Puts the words still unsettled into the draft after the settled ones, when they fit the box. */
    const keepUnsettled = () => {
      const words = unsettled.current;
      unsettled.current = "";
      setHeard("");
      const text = [base, settled, words].filter(Boolean).join(" ");
      if (words && text.length <= SAID_LIMIT) controller.change((current) => changeSaid(current, text));
    };
    try {
      mic.current = await startSpeech(
        mode,
        language,
        {
          result: (final, interim) => {
            if (abort.signal.aborted) return;
            const text = [base, final, interim].filter(Boolean).join(" ");
            if (text.length > SAID_LIMIT) {
              failed = true;
              keepUnsettled();
              abort.abort();
              setListening(false);
              setStatus("That is as much as the box holds. Fill in the fields from what is here.");
              return;
            }
            unsettled.current = interim;
            setHeard(interim);
            if (final !== settled) {
              settled = final;
              controller.change((current) => changeSaid(current, [base, final].filter(Boolean).join(" ")));
            }
          },
          error: (code, retryAt) => {
            failed = true;
            showSpeechProblem(code, retryAt);
          },
          end: (requested) => {
            // A session cut off at Stop's deadline ends with its last words unsettled; they are kept.
            if (!abort.signal.aborted) keepUnsettled();
            setListening(false);
            if (failed || abort.signal.aborted) return;
            // Stop fills the fields from what was said. A recognizer that ended by itself after a
            // pause leaves any words for the person to go on or fill in.
            const said = saidText(controller.getSnapshot().draft).trim();
            if (!requested) setStatus(speechPaused(Boolean(said)));
            else if (said) void fill();
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
      if (!abort.signal.aborted) setStatus(speechNotStarted(mode));
      speech.check();
    }
  }
  function stop() {
    if (import.meta.env.DEV && fixture) {
      setListening(false);
      void fill();
    } else if (mic.current) mic.current.stop();
    else stopWanted.current = true;
  }
  function addFiles(input: HTMLInputElement) {
    const selected = [...(input.files ?? [])];
    if (!selected.length) return;
    let added = false;
    try {
      const attachments = selected.map((file) => {
        if (file.size > MAX_FILE_BYTES) throw new Error();
        return { id: crypto.randomUUID(), name: file.name, type: file.type, bytes: file.size, blob: file };
      });
      controller.change((current) => revise(current, { attachments: [...current.attachments, ...attachments] }, true));
      setFileNote(attachments.length === 1 ? "File added. It stays on this device." : "Files added. They stay on this device.");
      added = true;
    } catch {
      const refused = "No files were added. Each file must be 25 MB or smaller and have a name under 256 characters.";
      setFileNote(refused);
      setStatus(refused);
    } finally {
      input.value = "";
    }
    // A file is read as soon as it is added, for the name, the place and the description. A card
    // linked to a Certified project takes its details from the project, so its files are only kept.
    if (added && !linked) void fill();
  }
  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let card: DeviceDraft;
    try {
      card = controller.change(continueDescribe);
    } catch (error) {
      // The press comes from the Step bar or a phone's dock, away from where the problem is. One
      // about a field is written at that field, which takes the focus, so the answer can be typed
      // at once. Any other is written at the end of the form and brought into view.
      if (error instanceof FieldsProblem && error.field) {
        const field = error.field;
        flushSync(() => setProblem({ field, message: error.message }));
        event.currentTarget.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
        return;
      }
      revealProblem(PROBLEM_ID, () =>
        setProblem({ message: error instanceof FieldsProblem ? error.message : "Check the four fields and try again." }),
      );
      return;
    }
    // Back to the card when its needs and offers are still checked, otherwise on to needs.
    navigate(fixtureHref(pathTo(afterInitiative(card)), routeSearch(), import.meta.env.DEV));
  }
  const offline = view === "offline" || !navigator.onLine;
  // Talking leads while nothing is written yet. After that Continue is the one filled button.
  const fresh = !said.trim() && !Object.values(form).some((value) => value.trim());
  // The browser's speech service leads only once the person has agreed to it on this device.
  const talkLeads = fresh && (speech.state === "ready" || (speech.state === "browser" && speech.agreed));
  // The way forward is drawn twice and shown once: in the Step bar on a wide screen, in the dock on
  // a phone (DL-089, DL-127). Both are outside the form, so Continue names the form it sends.
  const forward = (from?: "wide") => (
    <button
      className="rc-button"
      data-variant={talkLeads ? "secondary" : "primary"}
      data-from={from}
      type="submit"
      form={FIELDS_ID}
      disabled={!ready || working || listening}
    >
      Continue
    </button>
  );
  // Add Files opens the file picker directly. Beside the box its file is read at once.
  const addFilesButton = (
    <button
      ref={addFilesRef}
      className="rc-button"
      data-variant="secondary"
      type="button"
      disabled={working || listening}
      onClick={() => fileInput.current?.click()}
    >
      Add Files
    </button>
  );
  const files = (
    <AttachmentList
      files={draft.attachments}
      reads={linked ? undefined : (draft.lastBuild?.files ?? [])}
      reading={working}
      readOnBuild={!linked}
      links={[]}
      onRemoveFile={(id) =>
        controller.change((current) => revise(current, { attachments: current.attachments.filter((file) => file.id !== id) }, true))
      }
      onRemoveLink={() => {}}
      afterLast={addFilesRef}
    />
  );
  return (
    <Stack>
      <IntakeStepper>{forward("wide")}</IntakeStepper>
      <Heading level={1} size="page">
        Tell Us About Your Initiative
      </Heading>
      <DraftNotice error={storageError} text={draftText(draft)} onRetry={() => controller.retry()} />
      {/* Offered while signed out, so a project that already exists is not described twice. It keeps
          its place once words are typed, so the first word moves nothing. */}
      {import.meta.env.DEV && social && ready && !social.state.identity && (
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="quiet" data-size="sm" type="button" onClick={() => openDoor("certified")}>
            Sign In To Start From A Certified Project
          </button>
        </div>
      )}
      {/* The step is drawn at once, before this device's draft has opened, so what to say is on
          screen without waiting for storage. Its box and fields take input once the draft is open:
          until then they are inert, so nothing typed can land in a blank card, and the draft fills
          them in place, moving nothing. */}
      {/* On a wide screen the card fills in beside the fields. A phone shows it at the last step. */}
      <StepLayout asideFrom="wide" aside={<RecordPreview fields={previewFields(draft)} confirmed={!!draft.confirmed} />}>
        {/* Words and controls sit on a panel, so the mycelium behind the page does not run through them. */}
        <Panel>
          {offline && (
            <p className="rc-notice" data-tone="info">
              You are offline. Your words stay on this device.
            </p>
          )}
          {import.meta.env.DEV && fixture && view && <DescribeExamples key={view} view={view} />}
          {/* No heading of its own: the page's title already asks, and on a phone a second heading
              pushed the box to the fold (DL-127). */}
          {!linked && <div className="rc-stack">
            {/* What to say, in the order the fields under the box are filled (DL-127). */}
            <p>
              {!talksHere(speech.state)
                ? "Write three things: its name, where you work and what you do. Weave fills in the fields below, on this device."
                : "Say or type three things: its name, where you work and what you do. Weave fills in the fields below, on this device."}
            </p>
            <div className="rc-stack" inert={!ready || undefined}>
              <TalkItOut
                speech={speech}
                listening={listening}
                language={language}
                onLanguage={setLanguage}
                onStart={() => void talk()}
                onStop={stop}
                value={heard ? [said, heard].filter(Boolean).join(" ") : said}
                onChange={(text) => {
                  warmKeywordReader();
                  // A change typed while listening already holds the unsettled words it was shown.
                  unsettled.current = "";
                  setHeard("");
                  try {
                    controller.change((current) => changeSaid(current, text));
                  } catch (error) {
                    if (!(error instanceof FieldsProblem)) throw error;
                    setStatus(error.message);
                  }
                }}
                boxLabel={!talksHere(speech.state) ? "A few sentences about your initiative" : "What you said, or type a few sentences"}
                hint={SAY_EXAMPLE}
                actionLabel="Fill In The Fields"
                workingLabel="Stop Filling In"
                working={working}
                // A file added with an empty box is still something to read.
                actionReady={draft.attachments.length > 0}
                actions={addFilesButton}
                onAction={() => void fill()}
                onCancel={() => task.current?.abort()}
                speechLimitNotice={speechLimitNotice}
                status={status || boxNote(said) || (draft.attachments.length ? "" : "Files are optional, up to 25 MB each, and stay on this device.")}
                lead={talkLeads}
              />
              {files}
            </div>
          </div>}
          <form className="rc-form" data-width="full" id={FIELDS_ID} noValidate inert={!ready || undefined} onSubmit={next} onKeyDown={moveOnEnter}>
            <Heading level={2} size="section">
              Your Initiative
            </Heading>
            {linked ? (
              <>
                <p className="rc-meta">
                  From your Certified project, published {fullDate(linked.publishedOn)}. Change these details on Certified.
                </p>
                <Facts items={publicFacts(publicCard(draft))} />
                <div className="rc-action-bar">
                  {addFilesButton}
                  <p className="rc-meta rc-status-slot" role="status">
                    {fileNote || "Optional, up to 25 MB each. Files stay on this device."}
                  </p>
                </div>
                {files}
              </>
            ) : (
              <RecordFields
                value={form}
                filled={draft.filled}
                problem={problem?.field ? { field: problem.field, message: problem.message } : null}
                onChange={changeForm}
              />
            )}
            {/* A problem with the form as a whole is written in a place that is always there, so
                it pushes nothing down. One about a field is written at the field. */}
            <p className="rc-error rc-status-slot" role="alert" id={PROBLEM_ID}>
              {problem && !problem.field ? problem.message : ""}
            </p>
            <Dock>{forward()}</Dock>
          </form>
          {/* Add Files opens the file picker directly. The input is not drawn, and it sits outside
              the form so Enter in the last field never tries to move to it. */}
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            tabIndex={-1}
            aria-label="Add files"
            onChange={(event) => addFiles(event.currentTarget)}
          />
        </Panel>
      </StepLayout>
    </Stack>
  );
}

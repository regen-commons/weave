import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { MAX_FILE_BYTES, revise, type FieldKey, type RecordForm } from "../describe/contracts.ts";
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
import { keywordExtract } from "../describe/keyword-client.ts";
import { startSpeech } from "../describe/speech.ts";
import { deviceEngines, ledgerRows, structureWords } from "../describe/structure.ts";
import { useSpeechSetup } from "../describe/use-speech.ts";
import { speechMode, speechNotStarted, speechPaused, speechProblem, talksHere } from "../describe/speech-setup.ts";
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
import { publicCard } from "../initiative/status.ts";
import { Facts } from "../ui/Facts.tsx";
import { useAccountDoor } from "../account/door.tsx";
import { DraftSkeleton } from "../ui/CardSkeleton.tsx";

const FIELDS_ID = "describe-fields";
const PROBLEM_ID = "describe-problem";

/** What to say, shown as the box's hint: the shape the name, the place and the description are read from. */
const SAY_EXAMPLE = "For example: We are River Keepers, based in Nairobi. We restore the riverbank.";

/**
 * The describe step, on one page (DL-110). Talk it out leads: the person says or types a few
 * sentences in one box, and Weave fills the fields under it in place, on this device: the name,
 * where they work and what they do. A file added beside the box is read at once for the same
 * three. The fields stay editable, the link is the person's own to give, and one Continue goes
 * on to needs and offers: in the Step bar on a wide screen and in the dock on a phone (DL-125).
 * Nothing here opens, closes or moves when it is pressed.
 */
export function Describe({ fixture: examples }: { fixture?: FixtureContext }) {
  const { draft, error: storageError, ready, controller, fixture } = useDraft();
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
  const [fileNote, setFileNote] = useState("");
  // What stopped Continue: about one field, where it is then written, or about the form as a whole.
  const [problem, setProblem] = useState<{ field?: FieldKey; message: string } | null>(null);
  const task = useRef<AbortController | null>(null);
  const mic = useRef<{ stop(): void; dispose(): void } | null>(null);
  const micTask = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const view = examples?.describe;
  // A card linked to a Certified project lists its four public details read-only: the project owns them.
  const linked = import.meta.env.DEV && social?.state.identity ? social.state.project : null;
  const form = fieldsForm(draft);
  const said = saidText(draft);
  useEffect(() => {
    setWorking(view === "building");
    setListening(view === "listening");
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
      const engines = fixture ? [] : await deviceEngines();
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
    setProblem(null);
    const mode = speechMode(speech.state);
    if (!mode) return;
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
        setStatus(speechProblem(outcome, mode, speech.touch));
        return;
      }
      const said = "We are Orchard learning circle. Families share what they learn about the orchard.";
      setListening(true);
      controller.change((current) => changeSaid(current, [base, said].filter(Boolean).join(" ")));
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
            if (text.length > SAID_LIMIT) {
              failed = true;
              abort.abort();
              setListening(false);
              setStatus("That is as much as the box holds. Fill in the fields from what is here.");
              return;
            }
            controller.change((current) => changeSaid(current, text));
          },
          error: (code) => {
            failed = true;
            setStatus(speechProblem(code, mode, speech.touch));
          },
          end: (requested) => {
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
    } else mic.current?.stop();
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
    try {
      controller.change(continueDescribe);
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
    navigate(fixtureHref(pathTo("needs"), routeSearch(), import.meta.env.DEV));
  }
  const offline = view === "offline" || !navigator.onLine;
  // Talking leads while nothing is written yet. After that Continue is the one filled button.
  const fresh = !said.trim() && !Object.values(form).some((value) => value.trim());
  // The browser's speech service leads only once the person has agreed to it on this device.
  const talkLeads = fresh && (speech.state === "ready" || (speech.state === "browser" && speech.agreed));
  // The way forward is drawn twice and shown once: in the Step bar on a wide screen, in the dock on
  // a phone (DL-089, DL-125). Both are outside the form, so Continue names the form it sends.
  const forward = (from?: "wide") => (
    <button
      className="rc-button"
      data-variant={talkLeads ? "secondary" : "primary"}
      data-from={from}
      type="submit"
      form={FIELDS_ID}
      disabled={working || listening}
    >
      Continue
    </button>
  );
  // Add Files opens the file picker directly. Beside the box its file is read at once.
  const addFilesButton = (
    <button
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
    />
  );
  return (
    <Stack>
      <IntakeStepper current={0}>{forward("wide")}</IntakeStepper>
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
      {!ready ? (
        <DraftSkeleton />
      ) : (
        // On a wide screen the card fills in beside the fields. A phone shows it at the last step.
        <StepLayout asideFrom="wide" aside={<RecordPreview fields={previewFields(draft)} confirmed={!!draft.confirmed} />}>
          {/* Words and controls sit on a panel, so the mycelium behind the page does not run through them. */}
          <Panel>
            {offline && (
              <p className="rc-notice" data-tone="info">
                You are offline. Your words stay on this device.
              </p>
            )}
            {import.meta.env.DEV && fixture && view && <DescribeExamples key={view} view={view} />}
            {!linked && <section className="rc-stack" aria-labelledby="describe-talk">
              <Heading level={2} size="section" id="describe-talk">
                Say It In Your Own Words
              </Heading>
              {/* What to say, in the order the fields under the box are filled (DL-125). */}
              <p>
                {!talksHere(speech.state)
                  ? "Write three things: its name, where you work and what you do. Weave fills in the fields below, on this device."
                  : "Say or type three things: its name, where you work and what you do. Weave fills in the fields below, on this device."}
              </p>
              <TalkItOut
                speech={speech}
                listening={listening}
                language={language}
                onLanguage={setLanguage}
                onStart={() => void talk()}
                onStop={stop}
                value={said}
                onChange={(text) => {
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
                status={status || boxNote(said) || (draft.attachments.length ? "" : "Files are optional, up to 25 MB each, and stay on this device.")}
                lead={talkLeads}
              />
              {files}
            </section>}
            <form className="rc-form" data-width="full" id={FIELDS_ID} noValidate onSubmit={next} onKeyDown={moveOnEnter}>
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
      )}
    </Stack>
  );
}

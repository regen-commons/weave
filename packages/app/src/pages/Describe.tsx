import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_FILE_BYTES, revise, type RecordForm } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import {
  FieldsProblem,
  SAID_LIMIT,
  changeSaid,
  continueDescribe,
  detailChips,
  editFields,
  fieldsForm,
  fillFields,
  fillSummary,
  saidText,
  toggleDetail,
} from "../describe/fill.ts";
import { keywordExtract } from "../describe/keyword-client.ts";
import { startSpeech } from "../describe/speech.ts";
import { deviceEngines, ledgerRows, structureWords } from "../describe/structure.ts";
import { useSpeechSetup } from "../describe/use-speech.ts";
import { draftText, previewFields } from "../describe/view.ts";
import { exampleSpeech, type FixtureContext } from "../fixtures.ts";
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

/**
 * The describe step, on one page (DL-110). Talk it out leads: the person says or types a few
 * sentences in one box, and Weave fills the four fields under it in place, on this device. The
 * fields stay editable, the suggested details are optional chips, and one Continue goes on to
 * needs and offers. Nothing here opens, closes or moves when it is pressed.
 */
export function Describe({ fixture: examples }: { fixture?: FixtureContext }) {
  const { draft, error: storageError, ready, controller, fixture } = useDraft();
  const social = useSocialFixture();
  const openDoor = useAccountDoor();
  const [language, setLanguage] = useState(navigator.language || "en-US");
  const speech = useSpeechSetup(language, import.meta.env.DEV && examples ? exampleSpeech(examples.speech) : undefined);
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [fileNote, setFileNote] = useState("");
  const [problem, setProblem] = useState("");
  const task = useRef<AbortController | null>(null);
  const mic = useRef<{ stop(): void; dispose(): void } | null>(null);
  const micTask = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const view = examples?.describe;
  // A card linked to a Certified project lists its four public details read-only: the project owns them.
  const linked = import.meta.env.DEV && social?.state.identity ? social.state.project : null;
  const form = fieldsForm(draft);
  const said = saidText(draft);
  const chips = detailChips(draft);
  useEffect(() => {
    setWorking(view === "building");
    setListening(view === "listening");
    setStatus(
      view === "speech-error" ? "The microphone did not work. Your words are still here, and you can type in the box." : "",
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
    if (import.meta.env.DEV && view === "storage-error" && ready && !storageError)
      controller.change((current) => changeSaid(current, saidText(current) || "A change that could not be saved."));
  }, [controller, view, ready, storageError]);
  function changeForm(value: RecordForm) {
    setProblem("");
    controller.change((current) => editFields(current, value));
  }
  /** Structures the words in the box into the four fields and the suggested details, on this device. */
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
    setStatus("");
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
    setProblem("");
    const base = saidText(controller.getSnapshot().draft);
    // An example pretends to listen. The words are written here, inside the development-only
    // branch, so no example content reaches the production bundle.
    if (import.meta.env.DEV && fixture) {
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
          error: () => {
            failed = true;
            setStatus("The microphone could not continue. Your words are still here, and you can type in the box.");
          },
          end: () => {
            setListening(false);
            // Stop fills the fields from what was said. A failure leaves the words for the person to check first.
            if (!failed && !abort.signal.aborted && saidText(controller.getSnapshot().draft).trim()) void fill();
          },
        },
        undefined,
        abort.signal,
      );
    } catch {
      setListening(false);
      if (!abort.signal.aborted) setStatus("Speech is not ready on this device. You can type in the box.");
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
    try {
      const attachments = selected.map((file) => {
        if (file.size > MAX_FILE_BYTES) throw new Error();
        return { id: crypto.randomUUID(), name: file.name, type: file.type, bytes: file.size, blob: file };
      });
      controller.change((current) => revise(current, { attachments: [...current.attachments, ...attachments] }, true));
      setFileNote(attachments.length === 1 ? "File added. It stays on this device." : "Files added. They stay on this device.");
    } catch {
      setFileNote("No files were added. Each file must be 25 MB or smaller and have a name under 256 characters.");
    } finally {
      input.value = "";
    }
  }
  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      controller.change(continueDescribe);
    } catch (error) {
      // The press may come from a phone's dock, a screen away from where the problem is written.
      revealProblem(PROBLEM_ID, () =>
        setProblem(error instanceof FieldsProblem ? error.message : "Check the four fields and try again."),
      );
      return;
    }
    navigate(fixtureHref(pathTo("needs"), routeSearch(), import.meta.env.DEV));
  }
  const offline = view === "offline" || !navigator.onLine;
  // Talking leads while nothing is written yet. After that Continue is the one filled button.
  const fresh = !said.trim() && !Object.values(form).some((value) => value.trim());
  const talkLeads = fresh && speech.state === "ready";
  // The way forward is drawn twice and shown once: in its place on a wide screen, in the dock on a
  // phone (DL-089). The dock is outside the form, so Continue names the form it sends.
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
  return (
    <Stack>
      <IntakeStepper current={0} />
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
              <p>
                {speech.state === "none"
                  ? "Write a few sentences about what you do and where. Weave fills in the fields below, on this device."
                  : "Talk for a minute about what you do and where, or type it. Weave fills in the fields below, on this device."}
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
                boxLabel={speech.state === "none" ? "A few sentences about your initiative" : "What you said, or type a few sentences"}
                actionLabel="Fill In The Fields"
                workingLabel="Stop Filling In"
                working={working}
                onAction={() => void fill()}
                onCancel={() => task.current?.abort()}
                status={status}
                lead={talkLeads}
              />
            </section>}
            <form className="rc-form" id={FIELDS_ID} noValidate onSubmit={next} onKeyDown={moveOnEnter}>
              <Heading level={2} size="section">
                Your Initiative
              </Heading>
              {linked ? (
                <>
                  <p className="rc-meta">
                    From your Certified project, published {fullDate(linked.publishedOn)}. Change these details on Certified.
                  </p>
                  <Facts items={publicFacts(publicCard(draft))} />
                </>
              ) : (
                <RecordFields value={form} filled={draft.filled} last={chips.length === 0} onChange={changeForm} />
              )}
              <fieldset className="rc-field">
                <legend>Suggested details (optional)</legend>
                <p className="rc-hint" id="describe-details-hint">
                  {chips.length
                    ? "Tap the ones that fit. The rest are left off."
                    : "They appear here once the fields are filled."}
                </p>
                <div className="rc-chip-group" data-reserve="rows" aria-describedby="describe-details-hint">
                  {chips.map((chip) => (
                    <label className="rc-chip" data-pencil={chip.kept ? undefined : true} key={`${chip.key}:${chip.value}`}>
                      <input
                        className="rc-check"
                        type="checkbox"
                        checked={chip.kept}
                        onChange={() => controller.change((current) => toggleDetail(current, chip))}
                      />
                      {chip.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="rc-action-bar">
                <button className="rc-button" data-variant="secondary" type="button" onClick={() => fileInput.current?.click()}>
                  Add Files
                </button>
                <p className="rc-meta rc-status-slot" role="status">
                  {fileNote || "Optional, up to 25 MB each. Files stay on this device and are read when you fill in the fields."}
                </p>
              </div>
              <AttachmentList
                files={draft.attachments}
                links={[]}
                onRemoveFile={(id) =>
                  controller.change((current) =>
                    revise(current, { attachments: current.attachments.filter((file) => file.id !== id) }, true),
                  )
                }
                onRemoveLink={() => {}}
              />
              {/* A problem is written in a place that is always there, so it pushes nothing down. */}
              <p className="rc-error rc-status-slot" role="alert" id={PROBLEM_ID}>
                {problem}
              </p>
              <div className="rc-action-bar">{forward("wide")}</div>
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

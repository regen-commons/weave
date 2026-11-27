import { useEffect, useMemo, useRef, useState } from "react";
import { busyProps } from "../account/busy.ts";
import { useAccount } from "../account/context.tsx";
import { AccountFailure, accountMessage } from "../account/client.ts";
import { SignInButton } from "../account/SignInButton.tsx";
import { LENS_LABELS } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { initialsOf } from "../partners/public-initiative.ts";
import { projectAddress } from "../partners/public-project.ts";
import { teamWorkspacePath } from "../routes.ts";
import { useSocial } from "../social/context.tsx";
import { AskCards } from "../ui/AskCards.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Media } from "../ui/Media.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { WorkTag } from "../ui/WorkTag.tsx";
import { beginEditorHandoff, editorStorage, PROJECT_EDITORS } from "./editor-handoff.ts";
import { possibleDuplicate, type PossibleDuplicate } from "./possible-duplicate.ts";
import { ConsentButton } from "./ProjectConsent.tsx";
import {
  adoptPlan, clearPlan, needsPermission, newPlan, nextStep, PROJECT_NAME_LIMIT, projectFromDraft, projectNameFits, publishPreview, readPlan,
  resultLine, resultsSummary, sameEntry, unfinished, writePlan, type PublishPlan, type PublishStep,
} from "./publish-plan.ts";
import { browserRequests, checkListings, createProject, linkForPublishing, prepareListings, PreviewProblem, publishListings } from "./publish-run.ts";
import { newTid } from "./tid.ts";

const tabStorage = () => { try { return window.sessionStorage; } catch { return undefined; } };
/** What each step after the confirmation says while it runs. */
const WORKING: Partial<Record<PublishStep, string>> = {
  create: "Creating your project on Certified",
  link: "Linking your card to it",
  review: "Checking each listing against what you saw",
  publish: "Publishing your needs and offers",
};
const RUNS: readonly PublishStep[] = ["create", "link", "review", "publish"];

/**
 * Make It Public (DL-148, revised 25 November 2026; DL-155): the card as its public page will read, where it
 * goes, a warning where it may already exist on Certified or Ma Earth, and one confirmation. After it, Weave
 * creates a personal Certified project from the card unless one is linked, links the project in Weave, has
 * each listing reviewed from the draft and checked against the preview, and publishes them, going on by itself
 * after Certified's sign-in and permission screens. Nothing is saved privately. Ma Earth is a handoff with the
 * details to copy.
 */
export function PublishInitiative({ open, onClose, onPublished }: { open: boolean; onClose(): void; onPublished(): void }) {
  const { draft, controller } = useDraft();
  const account = useAccount();
  const social = useSocial();
  const owner = account.state?.user?.id ?? null;
  const live = social?.mode === "live" ? social : null;
  const project = live?.state.project ?? null;
  const [plan, setPlan] = useState<PublishPlan | null>(() => adoptPlan(readPlan(tabStorage(), draft.id), owner));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [consent, setConsent] = useState(false);
  const [duplicate, setDuplicate] = useState<PossibleDuplicate | null>(null);
  const [different, setDifferent] = useState(false);
  const [maEarth, setMaEarth] = useState(false);
  const [copied, setCopied] = useState(false);
  const task = useRef<AbortController | null>(null);
  const preview = useMemo(() => publishPreview(draft), [draft]);
  const card = draft.confirmed;
  useEffect(() => {
    const stored = readPlan(tabStorage(), draft.id);
    const next = adoptPlan(stored, owner);
    if (next && stored && next.owner !== stored.owner) writePlan(tabStorage(), next);
    setPlan(next);
  }, [draft.id, owner, open]);
  useEffect(() => () => task.current?.abort(), []);
  // Before Weave creates a project, it looks for one this card may already be: the account's own, or a public one.
  const own = useMemo(() => [...(live?.state.records ?? []), ...(live?.state.workspaces ?? [])], [live?.state.records, live?.state.workspaces]);
  useEffect(() => {
    if (!open || project || !card?.name.trim() || plan?.confirmed) return;
    const lookup = new AbortController();
    void possibleDuplicate({ name: card.name, links: card.links }, own, lookup.signal)
      .then((found) => { if (!lookup.signal.aborted) setDuplicate(found); }, () => {});
    return () => lookup.abort();
  }, [open, project, card?.name, card?.links, own, plan?.confirmed]);
  const keep = (next: PublishPlan) => { setPlan(next); writePlan(tabStorage(), next); };
  const step = nextStep(plan, { signedIn: !!owner, linked: project?.uri ?? null });

  /** Runs the step the plan is at. The effect below runs the next one, until it is done or something stops it. */
  async function advance() {
    if (busy || !plan || !live || !owner) return;
    const current = new AbortController(); task.current = current;
    setBusy(true); setProblem(""); setConsent(false);
    try {
      const signal = current.signal;
      if (step === "create") keep(await createProject(plan, browserRequests, signal));
      else if (step === "link") {
        if (!plan.projectUri) throw new PreviewProblem("Weave lost track of the project. Start again. Nothing was published.");
        // The card on this device is linked first, then the project in Weave, with no saved card behind it (DL-155).
        if (live.service.snapshot().project?.uri !== plan.projectUri) {
          await live.service.reload();
          await live.service.linkProject(plan.projectUri, signal, { keepCard: !!plan.creation });
          live.refresh();
          if (live.service.snapshot().project?.uri !== plan.projectUri)
            throw new PreviewProblem("The project could not be linked to your card yet. Try again. Nothing was published.");
        }
        keep(await linkForPublishing(plan, browserRequests, signal));
      } else if (step === "review") {
        keep(await prepareListings(plan, browserRequests, signal));
      } else if (step === "publish") {
        const result = await publishListings(plan, browserRequests, signal, keep);
        if (result.results.some((item) => item.state === "published")) onPublished();
      }
    } catch (error) {
      if (current.signal.aborted) return;
      if (error instanceof AccountFailure && error.code === "project_consent_required") setConsent(true);
      else setProblem(error instanceof AccountFailure ? accountMessage(error) : error instanceof Error ? error.message : accountMessage(error));
    } finally {
      if (task.current === current) { task.current = null; setBusy(false); }
    }
  }
  useEffect(() => {
    if (open && !busy && !problem && !consent && RUNS.includes(step)) void advance();
  }, [open, step, busy, problem, consent]);

  /** The one confirmation. Signed out it keeps the card's place, so the dialog reopens after Certified's sign-in. */
  function confirm() {
    if (!card || busy || !preview.listings.length || (!project && !projectNameFits(card.name))) return;
    const creation = project ? null : projectFromDraft(draft, () => newTid());
    const next = { ...newPlan(draft.id, owner, preview.listings, creation, project?.uri ?? null), confirmed: !!owner };
    if (!writePlan(tabStorage(), next) && !owner) {
      setProblem("This browser could not keep your card's place while you sign in. Allow this site to store data, then try again.");
      return;
    }
    setPlan(next);
  }
  function check() {
    if (busy || !plan?.workspaceId) return;
    const current = new AbortController(); task.current = current;
    setBusy(true); setProblem("");
    void checkListings(plan, browserRequests, current.signal, keep)
      .then((result) => { if (result.results.some((item) => item.state === "published")) onPublished(); })
      .catch(() => setProblem("The listings could not be checked. Try again."))
      .finally(() => { if (task.current === current) { task.current = null; setBusy(false); } });
  }
  function finish() {
    clearPlan(tabStorage(), draft.id);
    setPlan(null); setProblem(""); setConsent(false); setDifferent(false);
    onClose();
  }
  const details = card ? [card.name, card.locations.join(", "), card.description].filter(Boolean) : [];
  async function openMaEarth() {
    if (!owner || busy) return;
    const current = new AbortController(); task.current = current;
    setBusy(true); setProblem("");
    try {
      await beginEditorHandoff({ controller, storage: editorStorage(() => window.sessionStorage), owner, editor: "maearth", signal: current.signal,
        isCurrent: () => task.current === current, navigate: (target) => window.location.assign(target) });
    } catch (error) {
      if (!current.signal.aborted) setProblem(error instanceof Error ? error.message : "Ma Earth could not be opened. Try again.");
    } finally {
      if (task.current === current) { task.current = null; setBusy(false); }
    }
  }

  // A possible duplicate needs the person's word that this is a different initiative before a new project is made.
  const blocked = !!duplicate && !different && !project;
  // Certified takes a shorter project name than a card can hold; the card is changed first, never cut here.
  const longName = !!card && !project && !projectNameFits(card.name);
  const page = plan?.projectUri ? projectAddress(plan.projectUri) : project ? projectAddress(project.uri) : null;
  return (
    <TaskDialog title="Make It Public" open={open} onClose={onClose} blockClose={busy}>
      <div className="rc-stack" aria-busy={busy}>
        {maEarth ? (
          <>
            <p>Ma Earth makes its own project page, so Weave cannot create it there. Copy your details, create the project on Ma Earth, then come back and link it to this card.</p>
            <div className="rc-surface rc-stack" data-level="raised" aria-label="Your details">
              {details.map((line, index) => <p key={index}>{line}</p>)}
            </div>
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="secondary" type="button"
                onClick={() => void navigator.clipboard?.writeText(details.join("\n\n")).then(() => setCopied(true), () => setCopied(false))}>
                Copy Details
              </button>
              {owner ? (
                <button className="rc-button" data-variant="primary" type="button" {...busyProps(busy)} onClick={() => void openMaEarth()}>
                  <span>{`Open ${PROJECT_EDITORS.maearth.name}`}</span>
                  {busy && <span className="rc-spinner" aria-hidden="true" />}
                </button>
              ) : (
                <SignInButton>Sign In To Continue</SignInButton>
              )}
              <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={() => setMaEarth(false)}>Back</button>
            </div>
            {copied && <p className="rc-meta" role="status">Copied. Paste them into Ma Earth.</p>}
          </>
        ) : project?.group ? (
          <>
            <p>{`${project.name} is a group project. Its needs and offers are published from its team workspace, where teammates review them first.`}</p>
            {project.workspaceId && (
              <div className="rc-action-bar"><ButtonLink href={teamWorkspacePath(project.workspaceId)} variant="primary">Open Team Workspace</ButtonLink></div>
            )}
          </>
        ) : step === "done" && plan ? (
          <>
            <p role="status"><strong>{`${card?.name ?? "Your initiative"} is public on Certified.`}</strong> {resultsSummary(plan.results, plan.prepared.length)}</p>
            {/* Weave's public pages come from its list of public projects, which takes in new ones once a day. */}
            {plan.creation && <p>Anyone can read it on Certified now. Its page in Weave's list of initiatives appears after the list's next daily update.</p>}
            <ul className="rc-ask-summary" aria-label="Each listing">
              {plan.prepared.map((item) => {
                const result = plan.results.find((entry) => sameEntry(entry, item));
                return <li key={`${item.kind}/${item.entryId}`}><strong>{item.review.record.title}</strong><p>{result ? resultLine(result) : "Not sent yet."}</p></li>;
              })}
            </ul>
            <div className="rc-action-bar">
              {page && !plan.creation && <ButtonLink href={page} variant="primary">See Its Public Page</ButtonLink>}
              {needsPermission(plan.results) && <ConsentButton action="publish-initiative" />}
              {unfinished(plan.results).some((result) => result.state !== "review_lapsed" && result.state !== "conflict") && (
                <button className="rc-button" data-variant="secondary" type="button" {...busyProps(busy)} onClick={check}>
                  <span>Check Again</span>
                  {busy && <span className="rc-spinner" aria-hidden="true" />}
                </button>
              )}
              <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={finish}>Done</button>
            </div>
          </>
        ) : plan?.confirmed && step !== "sign-in" ? (
          <>
            <ol className="rc-stack" aria-label="Making it public">
              {RUNS.filter((item) => item !== "create" || plan.creation).map((item) => (
                <li key={item} aria-current={item === step ? "step" : undefined}>
                  {item === step ? <strong>{WORKING[item]}</strong> : <span className="rc-meta">{WORKING[item]}</span>}
                </li>
              ))}
            </ol>
            {busy && <p className="rc-visually-hidden" role="status">{WORKING[step]}</p>}
            {consent && (
              <>
                <p>Certified asks you once to let Weave create the project and add its needs and offers. It opens its own page, then brings you back here.</p>
                <div className="rc-action-bar"><ConsentButton action="publish-initiative" /></div>
              </>
            )}
            {problem && (
              <div className="rc-action-bar">
                <button className="rc-button" data-variant="secondary" type="button" onClick={() => setProblem("")}>Try Again</button>
                <button className="rc-button" data-variant="quiet" type="button" onClick={finish}>Stop</button>
              </div>
            )}
          </>
        ) : card ? (
          <>
            <p>
              {project
                ? `Weave adds these needs and offers to ${project.name}, your project on Certified. Anyone can read them. The project's name, description and place stay as they are on Certified.`
                : "Weave creates a personal project on Certified from your card, in your own Certified account, and adds these needs and offers to it. Anyone can read them, in Weave and in other apps."}
            </p>
            {longName && (
              <p className="rc-notice" data-tone="warning">{`Certified takes a project name of up to ${PROJECT_NAME_LIMIT} characters. Shorten your initiative's name in your card, then make it public.`}</p>
            )}
            {/* The warning stays once answered, so the answer can be changed. */}
            {duplicate && !project && (
              <section className="rc-notice" data-tone="warning" aria-labelledby="publish-duplicate">
                <div className="rc-notice-body">
                  <p className="rc-notice-title" id="publish-duplicate">{`This may already be on Certified: ${duplicate.name}`}</p>
                  <p>{`${duplicate.byline} Making it public again would create a second project.`}</p>
                  <div className="rc-action-bar">
                    {duplicate.where === "yours" && live && (
                      <button className="rc-button" data-variant="secondary" type="button" disabled={busy}
                        onClick={() => void live.service.linkProject(duplicate.uri).then(() => live.refresh(), (error: unknown) =>
                          setProblem(error instanceof Error ? error.message : "That project could not be linked. Try again."))}>
                        Use This Project
                      </button>
                    )}
                    {duplicate.path && <ButtonLink href={duplicate.path} variant="quiet">Open It</ButtonLink>}
                  </div>
                  <label className="rc-choice">
                    <input className="rc-check" type="checkbox" checked={different} onChange={(event) => setDifferent(event.target.checked)} />
                    <span className="rc-choice-text"><span className="rc-choice-title">This is a different initiative</span></span>
                  </label>
                </div>
              </section>
            )}
            {/* The card as its public page will read it: the mark, name and place, its words, and each listing. */}
            <section className="rc-surface rc-stack" data-level="raised" aria-label="Your public page">
              <div className="rc-record-head">
                <Media thumb initials={initialsOf(card.name)} />
                <div className="rc-record-head-text">
                  <p className="rc-record-title">{card.name}</p>
                  {card.locations.length > 0 && <p className="rc-card-meta">{card.locations.join(", ")}</p>}
                </div>
              </div>
              {card.description && <p className="rc-prose">{card.description}</p>}
              {/* Each listing carries the card's types of work, so they are shown here before anything is published. */}
              {card.lenses.length > 0 && (
                <ul className="rc-tag-list" aria-label="Type of work">
                  {card.lenses.map((lens) => <li key={lens}><WorkTag work={LENS_LABELS[lens]} /></li>)}
                </ul>
              )}
              {(["need", "offer"] as const).map((kind) => {
                const items = preview.listings.filter((item) => item.kind === kind);
                return items.length ? (
                  <section className="rc-card-list" key={kind} aria-labelledby={`publish-${kind}`}>
                    <h3 className="rc-heading" data-size="section" id={`publish-${kind}`}>{kind === "need" ? "What They Need" : "What They Can Offer"}</h3>
                    <AskCards kind={kind} label={kind === "need" ? "What they need" : "What they can offer"} Heading="h4"
                      items={items.map((item) => ({ key: item.entryId, title: item.title, description: item.description ?? undefined, capitals: item.capitalForms }))} />
                  </section>
                ) : null;
              })}
            </section>
            {preview.withoutKind.length > 0 && (
              <p className="rc-meta">{`${preview.withoutKind.length} ${preview.withoutKind.length === 1 ? "entry is" : "entries are"} left out until ${preview.withoutKind.length === 1 ? "it has" : "they have"} a kind of support.`}</p>
            )}
            <p className="rc-meta">Your card stays on this device. Weave keeps a copy of each listing and where it is published, so you can withdraw it later. Certified asks you once to allow it.</p>
            <div className="rc-action-bar">
              {owner ? (
                <button className="rc-button" data-variant="primary" type="button" {...busyProps(busy, blocked || longName || !preview.listings.length)} onClick={confirm}>
                  <span>Make It Public</span>
                </button>
              ) : (
                // The press keeps the card's place first, so the dialog opens again when Certified brings the person back.
                <span onClickCapture={confirm}><SignInButton>Sign In To Make It Public</SignInButton></span>
              )}
              {!project && (
                <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={() => setMaEarth(true)}>
                  Create It On Ma Earth Instead
                </button>
              )}
            </div>
          </>
        ) : (
          <p>Check your card first: Make It Public shows it as anyone would read it.</p>
        )}
        {problem && <p className="rc-notice" data-tone="warning" role="alert">{problem}</p>}
      </div>
    </TaskDialog>
  );
}

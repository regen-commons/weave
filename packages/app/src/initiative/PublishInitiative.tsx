import { useEffect, useMemo, useRef, useState } from "react";
import { busyProps } from "../account/busy.ts";
import { useAccount } from "../account/context.tsx";
import { activeInitiative } from "../account/active-initiative.ts";
import { AccountFailure, accountMessage } from "../account/client.ts";
import { SignInButton } from "../account/SignInButton.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { publicReviewFacts } from "../partners/public-support-state.ts";
import { teamWorkspacePath } from "../routes.ts";
import { useSocial } from "../social/context.tsx";
import { ProjectStep } from "../social/Project.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Facts } from "../ui/Facts.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { ConsentButton } from "./ProjectConsent.tsx";
import { useCardStatus } from "./use-card-status.ts";
import {
  adoptPlan, clearPlan, needsPermission, newPlan, publishCandidates, publishStep, readPlan, resultLine, resultsSummary,
  reviewsCurrent, sameEntry, unfinished, writePlan, type PublishEntry, type PublishPlan,
} from "./publish-plan.ts";
import { browserRequests, checkListings, prepareListings, PreviewProblem, publishListings } from "./publish-run.ts";

/** Where public listings go and who reads them, said before anything is chosen (QA notes, 25 November 2026). */
export const PUBLIC_DESTINATION = [
  { term: "Where it goes", value: "A Certified project you choose. Weave adds each need or offer you pick to that project's repository as a public listing." },
  { term: "Who can see it", value: "Anyone, in Weave and in other apps that read Certified projects." },
  { term: "What Certified keeps", value: "The project's name, description and place are written on Certified and edited there. Weave shows them and does not change them." },
] as const;

const tabStorage = () => { try { return window.sessionStorage; } catch { return undefined; } };
const kindLabel = (kind: "need" | "offer") => (kind === "need" ? "What you need" : "What you can offer");

/**
 * The public finish to the intake: choose needs and offers, sign in with Certified, choose a project,
 * prepare the exact preview, confirm once, and see each listing's result. The plan survives sign-in and
 * Certified's permission screens in the tab's own storage (`publish-plan.ts`).
 */
export function PublishInitiative({ open, onClose, onPublished }: { open: boolean; onClose(): void; onPublished(): void }) {
  const { draft, controller } = useDraft();
  const account = useAccount();
  const social = useSocial();
  const status = useCardStatus();
  const owner = account.state?.user?.id ?? null;
  const live = social?.mode === "live" ? social : null;
  const project = live?.state.project ?? null;
  // The project as Certified supplied it, for the fields Weave shows and never changes.
  const projectRecord = project ? [...(live?.state.records ?? []), ...(live?.state.workspaces ?? [])].find((item) => item.uri === project.uri) ?? null : null;
  const [plan, setPlan] = useState<PublishPlan | null>(() => adoptPlan(readPlan(tabStorage(), draft.id), owner));
  const [choice, setChoice] = useState<readonly PublishEntry[]>(plan?.selected ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const task = useRef<AbortController | null>(null);
  useEffect(() => {
    // A plan made before sign-in becomes this account's. Another account's plan is left alone, unshown.
    const stored = readPlan(tabStorage(), draft.id);
    const next = adoptPlan(stored, owner);
    if (next && stored && next.owner !== stored.owner) writePlan(tabStorage(), next);
    setPlan(next);
    setChoice(next?.selected ?? []);
  }, [draft.id, owner, open]);
  useEffect(() => () => task.current?.abort(), []);
  const candidates = useMemo(() => publishCandidates(draft), [draft]);
  const keep = (next: PublishPlan) => { setPlan(next); writePlan(tabStorage(), next); };
  const step = publishStep(plan, { signedIn: !!owner, project });
  const saved = activeInitiative(draft.account.saved, owner ?? undefined);

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (busy) return;
    const current = new AbortController(); task.current = current;
    setBusy(true); setProblem("");
    try { await action(current.signal); }
    catch (error) {
      if (!current.signal.aborted)
        setProblem(error instanceof AccountFailure ? accountMessage(error) : error instanceof Error ? error.message : accountMessage(error));
    } finally { if (task.current === current) { task.current = null; setBusy(false); } }
  }
  function begin() {
    const selected = candidates.filter((item) => item.publishable && choice.some((entry) => sameEntry(entry, item)))
      .map(({ kind, entryId }) => ({ kind, entryId }));
    const next = newPlan(draft.id, owner, selected);
    if (!writePlan(tabStorage(), next) && !owner) {
      setProblem("This browser could not keep your choice while you sign in. Allow this site to store data, then try again.");
      return;
    }
    setPlan(next);
  }
  /** Saves the card privately as the project's workspace only when it is not that already, then reviews each choice. */
  const prepare = (only?: readonly PublishEntry[]) => run(async (signal) => {
    if (!plan || !live || !owner || !project || project.group) return;
    let current = activeInitiative(controller.getSnapshot().draft.account.saved, owner);
    if (status.unsaved || !current || live.service.snapshot().project?.workspaceId !== current.id) {
      await live.service.save("", "private");
      live.refresh();
      current = activeInitiative(controller.getSnapshot().draft.account.saved, owner);
    }
    const workspaceId = live.service.snapshot().project?.workspaceId;
    if (!current || workspaceId !== current.id)
      throw new PreviewProblem("Your card was saved privately, but it is not this project's workspace in Weave yet. Open it from Your Initiatives, then try again. Nothing was published.");
    keep(await prepareListings(plan, current.id, { revision: current.revision }, browserRequests, signal, only));
  });
  const publish = () => run(async (signal) => {
    if (!plan || !project?.workspaceId) return;
    const result = await publishListings(plan, project.workspaceId, browserRequests, signal, keep);
    if (result.results.some((item) => item.state === "published")) onPublished();
  });
  const check = () => run(async (signal) => {
    if (!plan || !project?.workspaceId) return;
    const result = await checkListings(plan, project.workspaceId, browserRequests, signal, keep);
    if (result.results.some((item) => item.state === "published")) onPublished();
  });
  function finish() {
    clearPlan(tabStorage(), draft.id);
    setPlan(null); setChoice([]); setProblem("");
    onClose();
  }

  const current = plan && saved && project ? reviewsCurrent(plan, saved, project.uri) : false;
  const waiting = plan ? plan.prepared.filter((item) => !plan.results.some((result) => sameEntry(result, item))) : [];
  const lapsed = plan ? plan.results.filter((result) => result.state === "review_lapsed") : [];
  const followUp = plan ? unfinished(plan.results).some((result) => result.state !== "review_lapsed" && result.state !== "conflict") : false;
  return (
    <TaskDialog title="Make It Public" open={open} onClose={onClose} blockClose={busy}>
      <div className="rc-stack" aria-busy={busy}>
        {step === "choose" && (
          <>
            <Facts items={PUBLIC_DESTINATION} />
            <fieldset className="rc-choice-group">
              <legend>Needs and offers to make public</legend>
              {candidates.length === 0 && <p className="rc-meta">Your card has no needs or offers yet.</p>}
              {candidates.map((item) => {
                const chosen = choice.some((entry) => sameEntry(entry, item));
                return (
                  <label className="rc-choice" key={`${item.kind}/${item.entryId}`}>
                    <input className="rc-check" type="checkbox" checked={chosen} disabled={!item.publishable || busy}
                      onChange={(event) => setChoice((previous) => event.target.checked
                        ? [...previous, { kind: item.kind, entryId: item.entryId }]
                        : previous.filter((entry) => !sameEntry(entry, item)))} />
                    <span className="rc-choice-text">
                      <span className="rc-choice-title">{item.title}</span>
                      <span className="rc-choice-note">
                        {item.publishable ? kindLabel(item.kind) : `${kindLabel(item.kind)}. Add a kind of support to make it public.`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <p className="rc-meta">Nothing is public until you see the exact listings and confirm them.</p>
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="primary" type="button" disabled={!choice.length || busy} onClick={begin}>
                Continue
              </button>
            </div>
          </>
        )}
        {step === "sign-in" && (
          <>
            <p>Sign in with Certified to choose the project these go to. Your card and your choice stay on this device while you sign in.</p>
            <p className="rc-meta">Signing in only says who you are. It saves and publishes nothing.</p>
            <div className="rc-action-bar">
              <SignInButton />
              <button className="rc-button" data-variant="quiet" type="button" onClick={() => { clearPlan(tabStorage(), draft.id); setPlan(null); }}>Change The Choice</button>
            </div>
          </>
        )}
        {step === "project" && (
          live?.consent ? (
            <>
              <p>Allow Weave to read your Certified projects, so you can choose the one these go to. Certified asks you on its own page and brings you back.</p>
              <div className="rc-action-bar"><ConsentButton action="membership" /></div>
            </>
          ) : (
            <>
              <p>Choose the Certified project these needs and offers belong to. Linking it adds its name, description and place to this card on this device. Nothing is public yet.</p>
              <ProjectStep onDone={() => undefined} onCancel={onClose} />
            </>
          )
        )}
        {step === "group" && project && (
          <>
            <p>{project.name} is a group project. Its needs and offers are published from its team workspace, where teammates review them first.</p>
            {project.workspaceId && (
              <div className="rc-action-bar">
                <ButtonLink href={teamWorkspacePath(project.workspaceId)} variant="primary">Open Team Workspace</ButtonLink>
              </div>
            )}
          </>
        )}
        {step === "prepare" && project && (
          <>
            <Facts items={[
              { term: "Project", value: `${project.name}, your personal project on Certified` },
              { term: "First", value: "Weave saves this card privately as the project's workspace in your Weave account, so it can publish these listings and later withdraw them. Only you can see the workspace." },
              { term: "Then", value: "You see exactly what will be public. Nothing is public until you confirm." },
            ]} />
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="primary" type="button" {...busyProps(busy)} onClick={() => void prepare()}>
                <span>Prepare The Public Preview</span>
                {busy && <span className="rc-spinner" aria-hidden="true" />}
              </button>
            </div>
          </>
        )}
        {step === "review" && plan && project && (
          <>
            <p><strong>Anyone can read these listings.</strong> Withdrawing one later cannot erase copies other apps have already made.</p>
            <section className="rc-stack" aria-labelledby="publish-destination">
              <h3 className="rc-heading" data-size="section" id="publish-destination">Destination</h3>
              <Facts items={[
                { term: "Certified project", value: project.name },
                { term: "Repository", value: waiting[0]?.review.destination ?? project.uri.split("/")[2] ?? "" },
                { term: "Project address", value: project.uri },
              ]} />
            </section>
            <section className="rc-stack" aria-labelledby="publish-project">
              <h3 className="rc-heading" data-size="section" id="publish-project">From Certified, Not Changed By Weave</h3>
              <Facts items={[
                { term: "Name", value: project.name },
                ...(projectRecord?.description ? [{ term: "Description", value: projectRecord.description }] : []),
                ...(projectRecord?.locations.length ? [{ term: "Place", value: projectRecord.locations.join(", ") }] : []),
              ]} />
            </section>
            <section className="rc-stack" aria-labelledby="publish-listings">
              <h3 className="rc-heading" data-size="section" id="publish-listings">
                {`Published By Weave: ${waiting.length} ${waiting.length === 1 ? "Listing" : "Listings"}`}
              </h3>
              <ul className="rc-stack">
                {waiting.map((item) => (
                  <li key={`${item.kind}/${item.entryId}`}>
                    <Facts items={publicReviewFacts(item.review).filter((fact) => fact.term !== "Certified project")} />
                  </li>
                ))}
              </ul>
            </section>
            {current ? (
              <div className="rc-action-bar">
                <button className="rc-button" data-variant="primary" type="button" {...busyProps(busy)} onClick={() => void publish()}>
                  <span>{`Publish ${waiting.length} ${waiting.length === 1 ? "Listing" : "Listings"}`}</span>
                  {busy && <span className="rc-spinner" aria-hidden="true" />}
                </button>
              </div>
            ) : (
              <>
                <p className="rc-notice" data-tone="warning" role="status">
                  This preview is out of date: it lapsed, or the saved card changed since. Prepare it again to see what would be public now.
                </p>
                <div className="rc-action-bar">
                  <button className="rc-button" data-variant="primary" type="button" {...busyProps(busy)} onClick={() => void prepare(waiting)}>
                    <span>Prepare It Again</span>
                    {busy && <span className="rc-spinner" aria-hidden="true" />}
                  </button>
                </div>
              </>
            )}
          </>
        )}
        {step === "results" && plan && (
          <>
            <p role="status">{resultsSummary(plan.results, plan.prepared.length)}</p>
            <ul className="rc-ask-summary" aria-label="Each listing">
              {plan.prepared.map((item) => {
                const result = plan.results.find((entry) => sameEntry(entry, item));
                return (
                  <li key={`${item.kind}/${item.entryId}`}>
                    <strong>{item.review.record.title}</strong>
                    <p className="rc-meta">{kindLabel(item.kind)}</p>
                    <p>{result ? resultLine(result) : "Not sent yet."}</p>
                  </li>
                );
              })}
            </ul>
            <div className="rc-action-bar">
              {needsPermission(plan.results) && <ConsentButton action="publish-support" />}
              {followUp && (
                <button className="rc-button" data-variant="secondary" type="button" {...busyProps(busy)} onClick={() => void check()}>
                  <span>Check Again</span>
                  {busy && <span className="rc-spinner" aria-hidden="true" />}
                </button>
              )}
              {lapsed.length > 0 && (
                <button className="rc-button" data-variant="secondary" type="button" disabled={busy} onClick={() => void prepare(lapsed)}>
                  Prepare The Preview Again
                </button>
              )}
              <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={finish}>Done</button>
            </div>
          </>
        )}
        {problem && <p className="rc-notice" data-tone="warning" role="alert">{problem}</p>}
      </div>
    </TaskDialog>
  );
}

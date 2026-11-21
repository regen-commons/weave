import { useState } from "react";
import { SaveAction } from "../account/door.tsx";
import { SignInButton } from "../account/SignInButton.tsx";
import { InitiativeRecord } from "../initiative/InitiativeRecord.tsx";
import { LiveExposure } from "../social/LiveExposure.tsx";
import { PrivateSaveAction } from "../account/PrivateSaveAction.tsx";
import { activeInitiative } from "../account/active-initiative.ts";
import { useAccount } from "../account/context.tsx";
import { teamWorkspacePath } from "../routes.ts";
import { useDraft } from "../describe/use-draft.ts";
import { draftText, hasDraft } from "../describe/view.ts";
import type { FixtureContext } from "../fixtures.ts";
import { waitingSuggestions } from "../initiative/import.ts";
import { projectLinkLine } from "../initiative/list.ts";
import { useProjectLink } from "../initiative/use-project-link.ts";
import { ConsentButton } from "../initiative/ProjectConsent.tsx";
import { cardName, cardRoute, openSteps } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { intakeComplete, keptAsks } from "../intake/finish.ts";
import { ExamplePartners } from "../partners/ExamplePartners.tsx";
import { PartnerExperience } from "../partners/PartnerExperience.tsx";
import { pathTo } from "../routes.ts";
import { FUNDING_COMMONS } from "../links.ts";
import { ExampleSave } from "../social/Door.tsx";
import { DuplicateNotice } from "../social/DuplicateNotice.tsx";
import { ProjectAction, WorkspaceRow } from "../social/Project.tsx";
import { editorStorage, PROJECT_EDITORS, readEditorHandoff } from "../initiative/editor-handoff.ts";
import { ShareAction } from "../social/Share.tsx";
import { useSocialFixture, useSocial } from "../social/context.tsx";
import { waitingAction, waitingLine } from "../social/words.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { CardGridSkeleton, DraftSkeleton } from "../ui/CardSkeleton.tsx";
import { IntakeStepper } from "../ui/Stepper.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { FirstFunding } from "../ui/FirstFunding.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { Section } from "../ui/Section.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { Panel, Stack, StepLayout } from "../ui/layouts.tsx";

/**
 * The page a person comes back to. The initiative comes first. Beside it, or under it on a phone,
 * one row per step that is open now (saving, the team workspace, sharing for matching, publishing)
 * and the ways to change the card. Then what fits it.
 */
export function YourInitiative({ fixture }: { fixture?: FixtureContext }) {
  const social = useSocialFixture();
  const liveSocial = useSocial();
  const account = useAccount();
  const [matchVersion, setMatchVersion] = useState(0);
  const { draft, ready, error, controller } = useDraft();
  const status = useCardStatus();
  const [saveMessage, setSaveMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const checked = intakeComplete(draft);
  const waiting = waitingSuggestions(draft);
  const examples = import.meta.env.DEV && fixture;
  const example = examples && social ? social.state : null;
  const view = examples ? fixture.intake : "off";
  const loading = view === "loading" && !retrying;
  const failed = view === "error" && !retrying;
  const empty = view === "empty";
  const funds = examples && !empty ? fixture.funding.slice(0, 2) : [];
  const project = example?.identity ? example.project : liveSocial?.mode === "live" ? liveSocial.state.project : null;
  const active = activeInitiative(draft.account.saved, account.state?.user?.id);
  const save = status.save;
  // A local hint that this account left for an editor with this card. It proves nothing was published.
  const signedInId = liveSocial?.mode === "live" ? liveSocial.state.identity?.id : undefined;
  const handoff = signedInId ? readEditorHandoff(editorStorage(() => window.sessionStorage), signedInId, draft.id) : null;
  const link = useProjectLink();
  // Only steps that are open get a row, and only the next one gets the filled button.
  const steps = openSteps(status, project?.workspace ?? null);
  // What follows the record on a phone. On a wide screen it sits under the card, with Saving and
  // sharing beside both for the length of the page.
  const below = (
    <Stack wide>
      {(view === "offline" || !navigator.onLine) && (
        <p className="rc-notice" data-tone="info">
          You are offline. Your checked card remains on this device.
        </p>
      )}
      {failed && (
        <section className="rc-notice" data-tone="warning" aria-label="Funding did not load">
          <div className="rc-notice-body">
            <p>Funding did not load. Your card is safe.</p>
            <div className="rc-action-bar">
              <button
                className="rc-button"
                data-variant="secondary"
                type="button"
                onClick={() => setRetrying(true)}
              >
                Try Again
              </button>
            </div>
          </div>
        </section>
      )}
      <Section id="finish-partners" title="Partners For You">
        {examples ? <ExamplePartners compact /> : <PartnerExperience refreshVersion={matchVersion} mode="preview" separateActions />}
      </Section>
      <Section
        id="finish-funding"
        title="Funding That Fits"
        action={
          funds.length > 0 && !loading ? (
            <ButtonLink href={pathTo("funding")} variant="quiet">
              See All Funding
            </ButtonLink>
          ) : undefined
        }
      >
        {!examples ? (
          <FirstFunding />
        ) : loading ? (
          <>
            <CardGridSkeleton kind="funding" matched count={2} label="Comparing your card with funding" />
            <button
              className="rc-button"
              data-variant="secondary"
              type="button"
              onClick={() => setRetrying(true)}
            >
              Show Funding
            </button>
          </>
        ) : funds.length ? (
          <CardGrid>
            {funds.map((record) => (
              <li key={record.id}>
                <ListingCard record={record} personalized level={3} />
              </li>
            ))}
          </CardGrid>
        ) : (
          <>
            <p>No funding fits your card yet. You can browse the full directory.</p>
            <div className="rc-action-bar">
              <ButtonLink href={FUNDING_COMMONS} variant="secondary">
                Browse The Funding Catalog
              </ButtonLink>
            </div>
          </>
        )}
      </Section>
    </Stack>
  );
  // The third step of starting an initiative, until the card is saved: the stepper stays, and the
  // steps done are ways back (DL-113). A saved card is a page to come back to, with no steps.
  const inFlow = ready && checked && (status.state === "device" || status.state === "memory");
  return (
    <Stack wide>
      <Stack>
        {inFlow && (
          <IntakeStepper current={2}>
            <ButtonLink href={pathTo("needs")} variant="quiet">
              Back To Needs And Offers
            </ButtonLink>
          </IntakeStepper>
        )}
        {/* Once the card is checked the page names the initiative, echoing the name that led here.
            A wide screen's breadcrumbs already say which page this is. */}
        {ready && checked && (
          <p className="rc-eyebrow" data-until="wide">
            Your initiative
          </p>
        )}
        <Heading level={1} size="page">
          {ready && checked ? cardName(draft) : "Your Initiative"}
        </Heading>
        <DraftNotice
          error={error}
          text={draftText(draft)}
          onRetry={() => controller.retry()}
        />
        {inFlow && (
          <div className="rc-action-bar" data-until="wide">
            <ButtonLink href={pathTo("needs")} variant="quiet">
              Back To Needs And Offers
            </ButtonLink>
          </div>
        )}
      </Stack>
      {!ready ? (
        <DraftSkeleton />
      ) : !checked ? (
        <>
          <p>
            {hasDraft(draft)
              ? waitingLine(waiting, false) ||
                "Check your initiative, needs and offers first. Your words are still on this device."
              : "Describe your initiative and your card appears here."}
          </p>
          <div className="rc-action-bar">
            <ButtonLink href={hasDraft(draft) ? pathTo(cardRoute(draft)) : pathTo("new-initiative")} variant="primary">
              {hasDraft(draft) ? "Continue Your Card" : "Describe Your Initiative"}
            </ButtonLink>
          </div>
        </>
      ) : (
        <>
          <StepLayout
            wide
            more={below}
            aside={
              <Panel>
                <Section id="saving-sharing" title="Saving And Sharing">
                  <DuplicateNotice />
                  <StatusLine
                    actions={
                      !save ? undefined : example && save.needs === "save" ? (
                        <ExampleSave size="sm" onFailed={setSaveMessage} />
                      ) : !example && account.state?.user ? (
                        <PrivateSaveAction size="sm" onFailed={setSaveMessage}>{save.label}</PrivateSaveAction>
                      ) : (
                        <SaveAction variant="primary" size="sm">
                          {save.label}
                        </SaveAction>
                      )
                    }
                  >
                    {status.line}
                  </StatusLine>
                  {save?.note && <p className="rc-meta">{save.note}</p>}
                  {saveMessage && (
                    <p className="rc-notice" data-tone="warning" role="alert">
                      {saveMessage}
                    </p>
                  )}
                  {/* Outside the example world the real project directory links or creates the project. */}
                  {!example && !project && (
                    <StatusLine
                      actions={
                        handoff || link === "not-linked" ? (
                          <ProjectAction variant={handoff && !save ? "primary" : "secondary"} size="sm" />
                        ) : link === "signed-out" ? (
                          // Signing in is offered once: the save row above offers it while it is there.
                          save?.needs === "sign-in" ? undefined : <SignInButton variant="secondary" size="sm" />
                        ) : link === "unchecked" ? (
                          liveSocial?.consent ? (
                            <ConsentButton action="membership" />
                          ) : (
                            <button className="rc-button" data-variant="secondary" data-size="sm" type="button"
                              onClick={() => void liveSocial?.reload?.()}>
                              Try Again
                            </button>
                          )
                        ) : undefined
                      }
                    >
                      {handoff
                        ? `Back from ${PROJECT_EDITORS[handoff.editor].name}? Link your project once it is published.`
                        : projectLinkLine(link)}
                    </StatusLine>
                  )}
                  {!example && project?.workspaceId && project.group && <StatusLine actions={<ButtonLink href={teamWorkspacePath(project.workspaceId)} variant="secondary">Open Team Workspace</ButtonLink>}>Your team workspace is ready. This device card stays private until you choose to save it there.</StatusLine>}
                  {!example && project?.workspaceId && !project.group && project.workspaceId !== active?.id && <StatusLine actions={<ButtonLink href={pathTo("your-initiatives")} variant="secondary">Open Saved Initiative</ButtonLink>}>This project already has a saved initiative. Your device work stays here until you choose to open it.</StatusLine>}
                  {!example && project && !project.group && active && project.workspaceId === active.id && <LiveExposure saved={{ id: active.id, revision: active.revision, document: active.document, updatedAt: new Date().toISOString() }} owner={active.owner}
                    readOnly={status.unsaved} onChanged={() => setMatchVersion(v => v + 1)} />}
                  {project && <WorkspaceRow primary={steps.lead === "workspace"} />}
                  {steps.sharing && (
                    <StatusLine
                      actions={
                        steps.lead === "project" ? (
                          <ProjectAction variant="primary" size="sm" />
                        ) : (
                          <ShareAction variant={steps.lead === "share" ? "primary" : "secondary"} size="sm" />
                        )
                      }
                    >
                      {steps.sharing.line}
                    </StatusLine>
                  )}
                  {steps.publishing && (
                    <StatusLine actions={<ShareAction start="publish" variant="secondary" size="sm" />}>
                      {steps.publishing.line}
                    </StatusLine>
                  )}
                  {steps.later && <p className="rc-meta">{steps.later}</p>}
                </Section>
                <nav className="rc-section" aria-labelledby="change-it">
                  <Heading level={2} size="section" id="change-it">
                    Change It
                  </Heading>
                  <div className="rc-action-bar" data-layout="rows">
                    <ButtonLink href={pathTo("initiative")} variant="quiet">
                      Change Your Card
                    </ButtonLink>
                    <ButtonLink href={pathTo("needs")} variant="quiet">
                      Change Needs And Offers
                    </ButtonLink>
                  </div>
                </nav>
              </Panel>
            }
          >
            {/* Suggestions from the project page wait off the card, which shows kept entries only. */}
            {waiting.length > 0 && (
              <StatusLine
                actions={
                  <ButtonLink href={pathTo("needs")} variant="secondary" size="sm">
                    {waitingAction(waiting)}
                  </ButtonLink>
                }
              >
                {waitingLine(waiting, true)}
              </StatusLine>
            )}
            <InitiativeRecord named={false} fields={draft.confirmed!} needs={keptAsks(draft, "needs")} offers={keptAsks(draft, "offers")} />
          </StepLayout>
        </>
      )}
    </Stack>
  );
}

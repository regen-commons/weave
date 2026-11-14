import { useState } from "react";
import { SaveAction } from "../account/door.tsx";
import { InitiativeRecord } from "../initiative/InitiativeRecord.tsx";
import { LiveExposure } from "../social/LiveExposure.tsx";
import { PrivateSaveAction } from "../account/PrivateSaveAction.tsx";
import { activeInitiative } from "../account/active-initiative.ts";
import { useAccount } from "../account/context.tsx";
import { teamWorkspacePath } from "../routes.ts";
import { useDraft } from "../describe/use-draft.ts";
import { draftText, hasDraft } from "../describe/view.ts";
import type { FixtureContext } from "../fixtures.ts";
import { cardName, cardRoute, openSteps } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { intakeComplete, keptAsks } from "../intake/finish.ts";
import { ExamplePartners } from "../partners/ExamplePartners.tsx";
import { PartnerExperience } from "../partners/PartnerExperience.tsx";
import { pathTo } from "../routes.ts";
import { ExampleSave } from "../social/Door.tsx";
import { DuplicateNotice } from "../social/DuplicateNotice.tsx";
import { ProjectAction, WorkspaceRow } from "../social/Project.tsx";
import { editorStorage, PROJECT_EDITORS, readEditorHandoff } from "../initiative/editor-handoff.ts";
import { ShareAction } from "../social/Share.tsx";
import { useSocialFixture, useSocial } from "../social/context.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { FirstFunding } from "../ui/FirstFunding.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { Section } from "../ui/Section.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { Stack, StepLayout } from "../ui/layouts.tsx";

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
  const { draft, ready, storage, error, controller } = useDraft();
  const status = useCardStatus();
  const [saveMessage, setSaveMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const checked = intakeComplete(draft);
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
  // Only steps that are open get a row, and only the next one gets the filled button.
  const steps = openSteps(status, project?.workspace ?? null);
  return (
    <Stack>
      {/* Once the card is checked the page names the initiative, echoing the name that led here. */}
      {ready && checked && <p className="rc-eyebrow">Your initiative</p>}
      <Heading level={1} size="page">
        {ready && checked ? cardName(draft) : "Your initiative"}
      </Heading>
      <DraftNotice
        error={error}
        text={draftText(draft)}
        conflict={storage === "conflict"}
        onRetry={() => controller.retry()}
      />
      {!ready ? (
        <p role="status">Opening your device draft</p>
      ) : !checked ? (
        <>
          <p>
            {hasDraft(draft)
              ? "Check your initiative, needs and offers first. Your words are still on this device."
              : "Describe your initiative and your card appears here."}
          </p>
          <div className="rc-action-bar">
            <ButtonLink href={pathTo(cardRoute(draft))} variant="primary">
              {hasDraft(draft) ? "Continue your card" : "Describe your initiative"}
            </ButtonLink>
          </div>
        </>
      ) : (
        <>
          <StepLayout
            aside={
              <>
                <Section id="saving-sharing" title="Saving and sharing">
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
                    <StatusLine actions={<ProjectAction variant={handoff && !save ? "primary" : "secondary"} size="sm" />}>
                      {handoff
                        ? `Back from ${PROJECT_EDITORS[handoff.editor].name}? Link your project once it is published.`
                        : "Not linked to a Certified project yet."}
                    </StatusLine>
                  )}
                  {!example && project?.workspaceId && project.group && <StatusLine actions={<ButtonLink href={teamWorkspacePath(project.workspaceId)} variant="secondary">Open team workspace</ButtonLink>}>Your team workspace is ready. This device card stays private until you choose to save it there.</StatusLine>}
                  {!example && project?.workspaceId && !project.group && project.workspaceId !== active?.id && <StatusLine actions={<ButtonLink href={pathTo("your-initiatives")} variant="secondary">Open saved initiative</ButtonLink>}>This project already has a saved initiative. Your device work stays here until you choose to open it.</StatusLine>}
                  {!example && project && !project.group && active && project.workspaceId === active.id && <LiveExposure saved={{ id: active.id, revision: active.revision, document: active.document, updatedAt: new Date().toISOString() }} owner={active.owner}
                    readOnly={status.unsaved} onExpired={account.clear} onChanged={() => setMatchVersion(v => v + 1)} />}
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
                    Change it
                  </Heading>
                  <div className="rc-action-bar" data-layout="rows">
                    <ButtonLink href={pathTo("check-card")} variant="quiet">
                      Change your card
                    </ButtonLink>
                    <ButtonLink href={pathTo("needs")} variant="quiet">
                      Change needs and offers
                    </ButtonLink>
                  </div>
                </nav>
              </>
            }
          >
            <InitiativeRecord named={false} fields={draft.confirmed!} needs={keptAsks(draft, "needs")} offers={keptAsks(draft, "offers")} />
          </StepLayout>
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
                    Try again
                  </button>
                </div>
              </div>
            </section>
          )}
          <Section id="finish-partners" title="Partners for you">
            {examples ? <ExamplePartners compact /> : <PartnerExperience refreshVersion={matchVersion} mode="preview" separateActions />}
          </Section>
          <Section
            id="finish-funding"
            title="Funding that fits"
            action={
              funds.length > 0 && !loading ? (
                <ButtonLink href={pathTo("funding")} variant="quiet">
                  See all funding
                </ButtonLink>
              ) : undefined
            }
          >
            {!examples ? (
              <FirstFunding />
            ) : loading ? (
              <>
                <p className="rc-guide-status" role="status">
                  Comparing your card with funding
                </p>
                <div className="rc-skeleton" aria-hidden="true" />
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  onClick={() => setRetrying(true)}
                >
                  Show funding
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
                  <a
                    className="rc-button"
                    data-variant="secondary"
                    href="https://funding-commons.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Browse the funding catalog
                  </a>
                </div>
              </>
            )}
          </Section>

        </>
      )}
    </Stack>
  );
}

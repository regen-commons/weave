import { useState } from "react";
import { SaveAction } from "../account/door.tsx";
import { CAPITALS } from "../capitals.ts";
import { useDraft } from "../describe/use-draft.ts";
import { draftText, hasDraft } from "../describe/view.ts";
import type { FixtureContext } from "../fixtures.ts";
import { cardRoute, openSteps } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { intakeComplete, keptAsks } from "../intake/finish.ts";
import { askTerms } from "../intake/presentation.ts";
import { ExamplePartners } from "../partners/ExamplePartners.tsx";
import { PartnerExperience } from "../partners/PartnerExperience.tsx";
import { pathTo } from "../routes.ts";
import { ExampleSave } from "../social/Door.tsx";
import { DuplicateNotice } from "../social/DuplicateNotice.tsx";
import { ProjectAction, WorkspaceRow } from "../social/Project.tsx";
import { ShareAction } from "../social/Share.tsx";
import { useSocialFixture } from "../social/context.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { FirstFunding } from "../ui/FirstFunding.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { RecordPreview } from "../ui/RecordPreview.tsx";
import { Section } from "../ui/Section.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { Stack, StepLayout } from "../ui/layouts.tsx";
import { Tag } from "../ui/Tag.tsx";

/**
 * The page a person comes back to. The initiative comes first. Beside it, or under it on a phone,
 * one row per step that is open now (saving, the team workspace, sharing for matching, publishing)
 * and the ways to change the card. Then what fits it.
 */
export function YourInitiative({ fixture }: { fixture?: FixtureContext }) {
  const social = useSocialFixture();
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
  const project = example?.identity ? example.project : null;
  const save = status.save;
  // Only steps that are open get a row, and only the next one gets the filled button.
  const steps = openSteps(status, project?.workspace ?? null);
  return (
    <Stack>
      <Heading level={1} size="page">
        Your initiative
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
                  {!example && <ProjectAction />}
                  {example && <WorkspaceRow primary={steps.lead === "workspace"} />}
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
            <RecordPreview fields={draft.confirmed!} confirmed>
              {project && (
                <p className="rc-meta">The name, place, description and links come from your project on Certified.</p>
              )}
              {(["needs", "offers"] as const).map((kind) => (
                <section className="rc-stack" key={kind} aria-labelledby={`summary-${kind}`}>
                  <h3 className="rc-heading" data-size="section" id={`summary-${kind}`}>
                    {kind === "needs" ? "Needs" : "Offers"}, {keptAsks(draft, kind).length}
                  </h3>
                  {keptAsks(draft, kind).length ? (
                    <ul className="rc-ask-summary">
                      {keptAsks(draft, kind).map((ask, index) => (
                        <li key={index}>
                          <strong>{ask.title}</strong>
                          {ask.capitalForms.length ? (
                            <ul className="rc-tag-list" aria-label="Kinds of support">
                              {CAPITALS.filter((capital) => ask.capitalForms.includes(capital.key)).map(
                                (capital) => (
                                  <li key={capital.key}>
                                    <Tag capital={capital} />
                                  </li>
                                ),
                              )}
                            </ul>
                          ) : (
                            <p className="rc-meta">No kind of support yet</p>
                          )}
                          <p className="rc-meta">{askTerms(ask, kind)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rc-meta">None added.</p>
                  )}
                </section>
              ))}
            </RecordPreview>
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
          <Section id="finish-partners" title="Partners">
            {examples ? <ExamplePartners compact /> : <PartnerExperience mode="preview" />}
          </Section>
        </>
      )}
    </Stack>
  );
}

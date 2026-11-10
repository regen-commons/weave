import { useState } from "react";
import { SaveAction } from "../account/door.tsx";
import { CAPITALS } from "../capitals.ts";
import { useDraft } from "../describe/use-draft.ts";
import { draftText, hasDraft } from "../describe/view.ts";
import type { FixtureContext } from "../fixtures.ts";
import { cardRoute } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { cardText, intakeComplete, keptAsks } from "../intake/finish.ts";
import { askTerms } from "../intake/presentation.ts";
import { ExamplePartners } from "../partners/ExamplePartners.tsx";
import { PartnerExperience } from "../partners/PartnerExperience.tsx";
import { pathTo } from "../routes.ts";
import { ExampleSave } from "../social/Door.tsx";
import { WorkspaceRow, ProjectAction } from "../social/Project.tsx";
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
 * The page a person comes back to. Its first rows say where the initiative is saved and who can
 * see its needs and offers, one row per separate action: saving, sharing for matching, publishing.
 * Then the card, then what fits it.
 */
export function YourInitiative({ fixture }: { fixture?: FixtureContext }) {
  const social = useSocialFixture();
  const { draft, ready, storage, error, controller } = useDraft();
  const status = useCardStatus();
  const [copy, setCopy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
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
  // A row appears once its action is open. An earlier step still to take is that step's own row.
  const sharing = status.sharing && status.sharing.state !== "locked" ? status.sharing : null;
  const publishing =
    status.publishing && (status.publishing.state !== "locked" || status.publishing.waits === "authority")
      ? status.publishing
      : null;
  const waiting = project?.workspace === "absent" || project?.workspace === "requested";
  // One primary on the page: the first step still open.
  const lead = save ? "save" : waiting ? "workspace" : sharing && sharing.state !== "on" ? "share" : null;
  async function copyCard() {
    const text = cardText(draft);
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(text);
      setMessage("Card text copied. This does not include file bytes.");
    } catch {
      setCopy(text);
      setMessage("Select and copy your card text below. File bytes are not included.");
    }
  }
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
              <nav className="rc-stack" aria-label="Change your initiative">
                <h2 className="rc-heading" data-size="section">
                  Change it
                </h2>
                <div className="rc-action-bar">
                  <ButtonLink href={pathTo("check-card")} variant="quiet">
                    Change your card
                  </ButtonLink>
                  <ButtonLink href={pathTo("needs")} variant="quiet">
                    Change needs and offers
                  </ButtonLink>
                  <button
                    className="rc-button"
                    data-variant="quiet"
                    type="button"
                    onClick={() => void copyCard()}
                  >
                    Copy as text
                  </button>
                </div>
              </nav>
            }
          >
            <section className="rc-section" aria-label="Saving and sharing">
              <StatusLine
                state={status.state === "shared" || status.state === "published" ? "saved" : status.state}
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
              {!example && <ProjectAction />}
              {example && <WorkspaceRow primary={lead === "workspace"} />}
              {sharing && (
                <StatusLine
                  icon="people"
                  on={sharing.state === "on"}
                  actions={<ShareAction variant={lead === "share" ? "primary" : "secondary"} size="sm" />}
                >
                  {sharing.line}
                </StatusLine>
              )}
              {publishing && (
                <StatusLine
                  icon="globe"
                  on={publishing.state === "on"}
                  actions={
                    publishing.state === "locked" ? undefined : (
                      <ShareAction start="publish" variant="quiet" size="sm" />
                    )
                  }
                >
                  {publishing.line}
                </StatusLine>
              )}
            </section>
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
          {examples && (
            <p className="rc-notice" data-tone="info">
              Fictional matching example. Counts, funding and fit are invented; nothing is sent or shared.
            </p>
          )}
          {(view === "offline" || !navigator.onLine) && (
            <p className="rc-notice" data-tone="info">
              You are offline. Your checked card remains on this device.
            </p>
          )}
          {failed && (
            <section className="rc-notice" data-tone="warning" aria-label="Example catalog error">
              <div className="rc-notice-body">
                <p>Example catalog error. Your card is safe.</p>
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
                  See all funding examples
                </ButtonLink>
              ) : undefined
            }
          >
            {!examples ? (
              <FirstFunding />
            ) : loading ? (
              <>
                <p className="rc-guide-status" role="status">
                  Example: comparing your card with funding
                </p>
                <div className="rc-skeleton" aria-hidden="true" />
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  onClick={() => setRetrying(true)}
                >
                  Show the examples
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
                <p>No funding fits in this example. You can browse the full directory.</p>
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
          {message && (
            <p className="rc-meta" role="status">
              {message}
            </p>
          )}
          {copy && (
            <div className="rc-field">
              <label htmlFor="finished-card-text">Your card text</label>
              <textarea
                className="rc-input"
                id="finished-card-text"
                value={copy}
                rows={12}
                readOnly
                onFocus={(event) => event.target.select()}
              />
            </div>
          )}
        </>
      )}
    </Stack>
  );
}

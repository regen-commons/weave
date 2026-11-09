import { useSocialFixture } from "../social/context.tsx";
import { SocialAction } from "../social/Action.tsx";
import { AccountSection } from "../account/AccountSection.tsx";
import { PartnerExperience } from "../partners/PartnerExperience.tsx";
import { useState } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { useDraft } from "../describe/use-draft.ts";
import { draftText } from "../describe/view.ts";
import { cardText, intakeComplete, keptAsks } from "../intake/finish.ts";
import { CAPITALS } from "../capitals.ts";
import { pathTo } from "../routes.ts";
import { askTerms } from "../intake/presentation.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Heading } from "../ui/Heading.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { RecordPreview } from "../ui/RecordPreview.tsx";
import { Section } from "../ui/Section.tsx";
import { ShareCard } from "../ui/ShareCard.tsx";
import { FirstFunding } from "../ui/FirstFunding.tsx";
import { Stack, StepLayout } from "../ui/layouts.tsx";
import { Tag } from "../ui/Tag.tsx";

export function Finish({ fixture }: { fixture?: FixtureContext }) {
  const social = useSocialFixture();
  const { draft, ready, storage, error, controller } = useDraft();
  const [copy, setCopy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const checked = intakeComplete(draft);
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
  const examples = import.meta.env.DEV && fixture;
  const view = examples ? fixture.intake : "off";
  const loading = view === "loading" && !retrying;
  const failed = view === "error" && !retrying;
  const empty = view === "empty";
  const shared =
    examples &&
    (social ? social.state.visibility === "public" : fixture.scenario === "shared" || view === "shared");
  const funds = examples && !empty ? fixture.funding.slice(0, 2) : [];
  return (
    <Stack>
      <Heading level={1} size="page">
        Your first matches
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
          <p>Check your initiative, needs and offers first. Your words are still on this device.</p>
          <div className="rc-action-bar">
            <ButtonLink
              href={pathTo(draft.confirmed ? "needs" : draft.proposal ? "check-card" : "initiative")}
              variant="primary"
            >
              Continue your card
            </ButtonLink>
          </div>
        </>
      ) : (
        <StepLayout
          aside={
            <RecordPreview fields={draft.confirmed!} confirmed>
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
                          <ul className="rc-tag-list" aria-label="Kinds of support">
                            {CAPITALS.filter((capital) => ask.capitalForms.includes(capital.key)).map(
                              (capital) => (
                                <li key={capital.key}>
                                  <Tag capital={capital} />
                                </li>
                              ),
                            )}
                          </ul>
                          <p className="rc-meta">{askTerms(ask, kind)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rc-meta">None added.</p>
                  )}
                </section>
              ))}
              <div className="rc-action-bar">
                <ButtonLink href={pathTo("check-card")} variant="quiet">
                  Change your card
                </ButtonLink>
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  onClick={() => void copyCard()}
                >
                  Copy as text
                </button>
              </div>
            </RecordPreview>
          }
        >
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
                <p>
                  {examples
                    ? "No funding fits in this example. You can browse the full directory."
                    : "Funding matches are not connected in this version. Your card is ready on this device; browse the existing catalog while this is built."}
                </p>
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
          {!examples && <AccountSection compact />}
          <Section id="finish-partners" title="Partners">
            {!examples ? (
              <PartnerExperience mode="preview" />
            ) : shared ? (
              <>
                <p className="rc-meta">
                  Shared example. Partner previews below are fictional; no initiative has been published.
                </p>
                <CardGrid>
                  {fixture.initiatives.slice(0, 2).map((record) => (
                    <li key={record.id}>
                      <ListingCard record={record} personalized level={3} />
                    </li>
                  ))}
                </CardGrid>
              </>
            ) : (
              <ShareCard count={examples ? (empty ? 0 : 3) : null}>
                <p className="rc-meta">
                  Your card stays private. You can save a checked copy through your account. Partner sharing
                  is not available yet.
                </p>
                <SocialAction intent={{ kind: "share" }} inline />
                <div className="rc-action-bar">
                  <ButtonLink href={pathTo("partners")} variant="secondary">
                    Explore Partners
                  </ButtonLink>
                </div>
              </ShareCard>
            )}
          </Section>
          <div className="rc-action-bar">
            <ButtonLink href={pathTo("needs")} variant="quiet">
              Change your needs
            </ButtonLink>
            <ButtonLink href={pathTo("offers")} variant="quiet">
              Change your offers
            </ButtonLink>
          </div>
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
        </StepLayout>
      )}
    </Stack>
  );
}

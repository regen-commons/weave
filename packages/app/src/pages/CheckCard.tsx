import { useState, type FormEvent } from "react";
import {
  confirmDraft,
  DERIVED_LABELS,
  revise,
  reviewedProposal,
  type DerivedKey,
  type RecordForm,
} from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { editsFromForm, formFrom, parseRecordForm } from "../describe/forms.ts";
import { draftText } from "../describe/view.ts";
import { navigate } from "../router.tsx";
import { fixtureHref, INTAKE_STEPS, pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Heading } from "../ui/Heading.tsx";
import { StepLayout, Stack } from "../ui/layouts.tsx";
import { RecordFields } from "../ui/RecordFields.tsx";
import { RecordPreview } from "../ui/RecordPreview.tsx";
import { ReviewDetail } from "../ui/ReviewDetail.tsx";
import { Stepper } from "../ui/Stepper.tsx";
export function CheckCard() {
  const { draft, controller, storage, error: storageError, ready } = useDraft();
  const [message, setMessage] = useState("");
  const fields = reviewedProposal(draft);
  const form = draft.form ?? (fields ? formFrom(fields) : null);
  function changeForm(value: RecordForm) {
    controller.change((current) =>
      revise(current, {
        form: value,
        publicEdits: editsFromForm(value, current.publicEdits),
        confirmed: null,
      }),
    );
  }
  function keep(field: DerivedKey) {
    controller.change((current) =>
      revise(current, {
        kept: [...new Set([...current.kept, field])],
        derivedEdits: { ...current.derivedEdits, [field]: fields![field] },
        confirmed: null,
      }),
    );
    setMessage(`${DERIVED_LABELS[field]} kept.`);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!form) return;
      controller.change((current) => confirmDraft(revise(current, { publicEdits: parseRecordForm(form) })));
      navigate(fixtureHref(pathTo("needs"), window.location.search, import.meta.env.DEV));
    } catch {
      setMessage(
        "Add a name, check the four fields and keep or cancel open changes. Keep, change or remove the details in pencil. If your words changed, build the card again.",
      );
    }
  }
  return (
    <Stack>
      <Stepper steps={INTAKE_STEPS.map((step) => step.label)} current={0} />
      <Heading level={1} size="page">
        Check your card
      </Heading>
      <DraftNotice
        error={storageError}
        text={draftText(draft)}
        conflict={storage === "conflict"}
        onRetry={() => controller.retry()}
      />
      {!ready ? (
        <p role="status">Opening your device draft</p>
      ) : !fields || !form ? (
        <>
          <p>Describe your initiative first. Your card will appear here.</p>
          <ButtonLink href={pathTo("initiative")} variant="primary">
            Describe your initiative
          </ButtonLink>
        </>
      ) : (
        <StepLayout aside={<RecordPreview fields={fields} confirmed={!!draft.confirmed} />}>
          {draft.proposalVersion !== draft.inputVersion && (
            <p className="rc-notice" data-tone="warning">
              Your words changed.{" "}
              <ButtonLink href={pathTo("initiative")} variant="quiet">
                Build the card again
              </ButtonLink>
            </p>
          )}
          {draft.lastBuild?.fallback && (
            <p className="rc-notice" data-tone="warning">
              The browser model was unavailable or could not finish. This is the keyword draft; your full
              words are still here.
            </p>
          )}
          {!!draft.lastBuild?.unreadFiles && (
            <p className="rc-meta">
              {draft.lastBuild.unreadFiles} {draft.lastBuild.unreadFiles === 1 ? "file was" : "files were"}{" "}
              kept on this device without reading the content. Add any missing details below.
            </p>
          )}
          {(draft.lastBuild?.sourceCharacters ?? 0) > 800 && (
            <p className="rc-meta">
              Your full conversation is kept. About it holds up to 800 characters, ready for you to edit.
            </p>
          )}
          {!!draft.lastBuild?.files.some((file) => file.status === "partial") && (
            <p className="rc-meta">
              Some PDF pages had no readable text. Their original bytes remain on this device.
            </p>
          )}
          <form className="rc-form" onSubmit={submit}>
            <section className="rc-stack" aria-labelledby="public-card-fields">
              <Heading level={2} size="section" id="public-card-fields">
                What people see first
              </Heading>
              <p className="rc-meta">Yours to edit. Nothing is shared yet.</p>
              <RecordFields value={form} onChange={changeForm} />
            </section>
            <section className="rc-review" aria-labelledby="derived-details">
              <div className="rc-section-head">
                <Heading level={2} size="section" id="derived-details">
                  Worked out from what you shared
                </Heading>
                <button
                  className="rc-button"
                  data-variant="quiet"
                  type="button"
                  onClick={() => {
                    controller.change((current) =>
                      revise(current, {
                        kept: (Object.keys(DERIVED_LABELS) as DerivedKey[]).filter(
                          (field) => !current.removed.includes(field) && !current.reviewEdits[field],
                        ),
                        derivedEdits: {
                          ...current.derivedEdits,
                          ...Object.fromEntries(
                            (Object.keys(DERIVED_LABELS) as DerivedKey[])
                              .filter(
                                (field) => !current.removed.includes(field) && !current.reviewEdits[field],
                              )
                              .map((field) => [field, fields[field]]),
                          ),
                        },
                        confirmed: null,
                      }),
                    );
                    setMessage("Remaining details kept. You can still change them.");
                  }}
                >
                  Keep remaining details
                </button>
              </div>
              <ul className="rc-review-list rc-review-grid">
                {(Object.keys(DERIVED_LABELS) as DerivedKey[]).map((field) => (
                  <ReviewDetail
                    key={field}
                    field={field}
                    fields={fields}
                    kept={draft.kept.includes(field)}
                    removed={draft.removed.includes(field)}
                    editor={draft.reviewEdits[field]}
                    onEditor={(value) =>
                      controller.change((current) => {
                        const reviewEdits = { ...current.reviewEdits };
                        const previous = reviewEdits[field];
                        if (value) reviewEdits[field] = value;
                        else delete reviewEdits[field];
                        return revise(current, {
                          reviewEdits,
                          confirmed: null,
                          kept: value
                            ? current.kept.filter((key) => key !== field)
                            : previous?.wasKept
                              ? [...new Set([...current.kept, field])]
                              : current.kept,
                        });
                      })
                    }
                    onKeep={() => keep(field)}
                    onChange={(change) => {
                      controller.change((current) =>
                        revise(current, {
                          reviewEdits: Object.fromEntries(
                            Object.entries(current.reviewEdits).filter(([key]) => key !== field),
                          ),
                          derivedEdits: { ...current.derivedEdits, ...change },
                          kept: [...new Set([...current.kept, field])],
                          confirmed: null,
                        }),
                      );
                      setMessage(`${DERIVED_LABELS[field]} changed and kept.`);
                    }}
                    onRemove={() => {
                      controller.change((current) =>
                        revise(current, {
                          removed: [...new Set([...current.removed, field])],
                          kept: current.kept.filter((key) => key !== field),
                          confirmed: null,
                        }),
                      );
                      setMessage(`${DERIVED_LABELS[field]} removed. Undo is available.`);
                    }}
                    onUndo={() =>
                      controller.change((current) =>
                        revise(current, {
                          removed: current.removed.filter((key) => key !== field),
                          confirmed: null,
                        }),
                      )
                    }
                  />
                ))}
              </ul>
              <p className="rc-meta">
                Places are the words you gave, without a map lookup. Themes are keyword or model suggestions,
                not verified catalog labels.
              </p>
            </section>
            {message && (
              <p className="rc-meta" role="status">
                {message}
              </p>
            )}
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="primary" type="submit">
                Keep card and continue
              </button>
              <ButtonLink href={pathTo("initiative")} variant="quiet">
                Add or change your words
              </ButtonLink>
            </div>
          </form>
        </StepLayout>
      )}
    </Stack>
  );
}

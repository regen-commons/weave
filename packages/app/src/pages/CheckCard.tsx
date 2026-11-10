import { useEffect, useRef, useState, type FormEvent } from "react";
import type { z } from "zod";
import { checkForm, checkView, keepCard, keepProblem, publicDetails } from "../describe/check.ts";
import {
  DERIVED_LABELS,
  type DerivedEditsSchema,
  pendingDetails,
  revise,
  reviewedProposal,
  type DerivedKey,
  type DeviceDraft,
  type RecordForm,
} from "../describe/contracts.ts";
import { detailText, hasDetail, NOT_STATED } from "../describe/details.ts";
import { editsFromForm } from "../describe/forms.ts";
import { describeView, hasConversation } from "../describe/screen.ts";
import { useDraft } from "../describe/use-draft.ts";
import { draftText } from "../describe/view.ts";
import { fullDate } from "../home.ts";
import { cardRoute } from "../initiative/status.ts";
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, INTAKE_STEPS, pathTo } from "../routes.ts";
import { useSocialFixture } from "../social/context.tsx";
import { publicFacts } from "../social/words.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { DetailEditor } from "../ui/DetailEditor.tsx";
import { DraftNotice } from "../ui/DraftNotice.tsx";
import { Facts } from "../ui/Facts.tsx";
import { Heading } from "../ui/Heading.tsx";
import { Stack } from "../ui/layouts.tsx";
import { RecordFields } from "../ui/RecordFields.tsx";
import { Stepper } from "../ui/Stepper.tsx";

const DETAILS = Object.keys(DERIVED_LABELS) as DerivedKey[];

/**
 * The check card. The person sees what the app proposed and keeps, changes or removes it before
 * it counts; one Keep card confirms it all (T5). A card linked to a Certified project lists its
 * four public details read-only, because the project owns them.
 */
export function CheckCard() {
  const { draft, controller, storage, error: storageError, ready } = useDraft();
  const social = useSocialFixture();
  const [message, setMessage] = useState("");
  // A problem holds only for the card it was raised on, so any change to the card clears it.
  const [problem, setProblem] = useState<{ revision: number; text: string } | null>(null);
  const focusChip = useRef<DerivedKey | null>(null);
  const view = checkView(draft);
  const fields = reviewedProposal(draft);
  const form = checkForm(draft);
  const editing = (Object.keys(draft.reviewEdits) as DerivedKey[])[0];
  const pending = pendingDetails(draft);
  const linked = import.meta.env.DEV && social?.state.identity ? social.state.project : null;
  // Where the person goes once the card needs nothing more here. Until then the route is not a way on.
  const route = cardRoute(draft);
  const settled = route === "needs" || route === "your-initiative";
  const build = draft.lastBuild;
  const notes = [
    build?.unreadFiles
      ? `${build.unreadFiles} ${build.unreadFiles === 1 ? "file was" : "files were"} kept but not read.`
      : "",
    (build?.sourceCharacters ?? 0) > 800 ? "About it holds up to 800 characters. Your full words are kept." : "",
    build?.files.some((file) => file.status === "partial") ? "Some PDF pages had no readable text." : "",
  ]
    .filter(Boolean)
    .join(" ");
  useEffect(() => {
    if (!focusChip.current) return;
    document.getElementById(`detail-${focusChip.current}`)?.focus();
    focusChip.current = null;
  }, [draft.reviewEdits, draft.kept, draft.removed]);
  function changeForm(value: RecordForm) {
    controller.change((current) =>
      revise(current, {
        form: value,
        publicEdits: editsFromForm(value, current.publicEdits),
        confirmed: null,
      }),
    );
  }
  function closeEditor(current: typeof draft, field: DerivedKey) {
    const { [field]: _closed, ...reviewEdits } = current.reviewEdits;
    return reviewEdits;
  }
  /** One detail open at a time: opening another cancels the first, restoring what it had. */
  function openEditor(field: DerivedKey) {
    controller.change((current) => {
      const open = (Object.keys(current.reviewEdits) as DerivedKey[])[0];
      const restored =
        open && open !== field && current.reviewEdits[open]?.wasKept
          ? [...new Set([...current.kept, open])]
          : current.kept;
      const value = reviewedProposal(current)!;
      return revise(current, {
        reviewEdits: {
          [field]: {
            value:
              field === "stage"
                ? (value.stage ?? "")
                : field === "languages"
                  ? detailText("languages", value).replace(NOT_STATED, "")
                  : field === "lenses"
                    ? ""
                    : value[field].join("; "),
            lenses: [...value.lenses],
            wasKept: restored.includes(field),
          },
        },
        kept: restored.filter((key) => key !== field),
        confirmed: null,
      });
    });
  }
  function cancelEditor(field: DerivedKey) {
    focusChip.current = field;
    controller.change((current) => {
      const previous = current.reviewEdits[field];
      return revise(current, {
        reviewEdits: closeEditor(current, field),
        kept: previous?.wasKept ? [...new Set([...current.kept, field])] : current.kept,
        confirmed: null,
      });
    });
  }
  function changeDetail(field: DerivedKey, change: z.infer<typeof DerivedEditsSchema>) {
    focusChip.current = field;
    controller.change((current) =>
      revise(current, {
        reviewEdits: closeEditor(current, field),
        derivedEdits: { ...current.derivedEdits, ...change },
        kept: [...new Set([...current.kept, field])],
        confirmed: null,
      }),
    );
    setMessage(`${DERIVED_LABELS[field]} changed and kept.`);
  }
  function removeDetail(field: DerivedKey) {
    focusChip.current = field;
    controller.change((current) =>
      revise(current, {
        reviewEdits: closeEditor(current, field),
        removed: [...new Set([...current.removed, field])],
        kept: current.kept.filter((key) => key !== field),
        confirmed: null,
      }),
    );
    setMessage(`${DERIVED_LABELS[field]} removed. It will not be guessed again.`);
  }
  function undoRemove(field: DerivedKey) {
    focusChip.current = field;
    controller.change((current) =>
      revise(current, { removed: current.removed.filter((key) => key !== field), confirmed: null }),
    );
    setMessage(`${DERIVED_LABELS[field]} is back in pencil.`);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing) {
      setProblem({ revision: draft.revision, text: "Keep or cancel the open detail first." });
      return;
    }
    let next: DeviceDraft;
    try {
      next = controller.change((current) => keepCard(current, !!(import.meta.env.DEV && linked)));
    } catch (error) {
      setProblem({ revision: draft.revision, text: keepProblem(error) });
      return;
    }
    navigate(fixtureHref(pathTo(cardRoute(next)), routeSearch(), import.meta.env.DEV));
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
      ) : view === "describe" || !fields || !form ? (
        <>
          <p>Describe your initiative first.</p>
          <div className="rc-action-bar">
            <ButtonLink href={pathTo("initiative")} variant="primary">
              Describe your initiative
            </ButtonLink>
          </div>
        </>
      ) : view === "rebuild" ? (
        <>
          <p className="rc-notice" data-tone="warning">
            Your words changed after this card was built.
          </p>
          <div className="rc-action-bar">
            <ButtonLink href={pathTo("initiative")} variant="primary">
              {describeView(draft, null) === "fields" ? "Go back to the four fields" : "Build the card again"}
            </ButtonLink>
          </div>
        </>
      ) : (
        <form className="rc-form" onSubmit={submit}>
          {build?.fallback && (
            <p className="rc-notice" data-tone="warning">
              The browser model could not finish, so keyword rules built this card. Your words are kept.
            </p>
          )}
          {notes && <p className="rc-meta">{notes}</p>}
          <article className="rc-card" aria-label="Your card">
            {import.meta.env.DEV && linked ? (
              <>
                <p className="rc-meta">
                  From your Certified project, published {fullDate(linked.publishedOn)}. Change these details on
                  Certified.
                </p>
                <Facts items={publicFacts(publicDetails(fields))} />
              </>
            ) : (
              <RecordFields value={form} onChange={changeForm} />
            )}
            <section className="rc-stack" aria-labelledby="derived-details">
              <Heading level={2} size="section" id="derived-details">
                Other details
              </Heading>
              {pending.length > 0 && (
                <p className="rc-meta" id="pencil-note">
                  Dashed means suggested. Tap one to change or remove it, or keep them all below.
                </p>
              )}
              <ul className="rc-tag-list" aria-label="Other details">
                {DETAILS.map((field) => {
                  const label = DERIVED_LABELS[field];
                  const kept = draft.kept.includes(field);
                  const removed = draft.removed.includes(field);
                  const open = editing === field;
                  return (
                    <li key={field}>
                      {removed ? (
                        <button
                          className="rc-chip"
                          type="button"
                          id={`detail-${field}`}
                          onClick={() => undoRemove(field)}
                        >
                          {label} removed. Undo
                        </button>
                      ) : !hasDetail(field, fields) ? (
                        <button
                          className="rc-chip"
                          type="button"
                          id={`detail-${field}`}
                          aria-expanded={open}
                          onClick={() => openEditor(field)}
                        >
                          Add {label.toLocaleLowerCase()}
                        </button>
                      ) : (
                        <button
                          className="rc-chip"
                          data-pencil={!kept || undefined}
                          type="button"
                          id={`detail-${field}`}
                          aria-expanded={open}
                          aria-describedby={kept ? undefined : "pencil-note"}
                          onClick={() => openEditor(field)}
                        >
                          {label}: {detailText(field, fields)}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {editing && draft.reviewEdits[editing] && (
                <DetailEditor
                  key={editing}
                  field={editing}
                  fields={fields}
                  editor={draft.reviewEdits[editing]}
                  onEditor={(value) =>
                    controller.change((current) =>
                      revise(current, { reviewEdits: { ...current.reviewEdits, [editing]: value } }),
                    )
                  }
                  onChange={(change) => changeDetail(editing, change)}
                  onRemove={() => removeDetail(editing)}
                  onCancel={() => cancelEditor(editing)}
                />
              )}
            </section>
          </article>
          {message && (
            <p className="rc-notice" data-tone="info" role="status">
              {message}
            </p>
          )}
          {problem?.revision === draft.revision && (
            <p className="rc-error" role="alert">
              {problem.text}
            </p>
          )}
          <div className="rc-action-bar">
            {import.meta.env.DEV && linked && settled ? (
              <ButtonLink href={pathTo(route)} variant="primary">
                {route === "your-initiative" ? "Back to your initiative" : "Continue"}
              </ButtonLink>
            ) : (
              <>
                <button className="rc-button" data-variant="primary" type="submit">
                  {pending.length ? "Keep card and continue" : "Continue"}
                </button>
                {!(import.meta.env.DEV && linked) && hasConversation(draft) && (
                  <ButtonLink href={pathTo("initiative")} variant="quiet">
                    Add or change your words
                  </ButtonLink>
                )}
              </>
            )}
          </div>
        </form>
      )}
    </Stack>
  );
}

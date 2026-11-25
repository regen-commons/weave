import type { ReactNode } from "react";
import { Dialog } from "./Dialog.tsx";
import { Heading } from "./Heading.tsx";
import { ListLayout, NarrowLayout } from "./layouts.tsx";
import { keepFocusOnPage } from "./focus.ts";
import { SectionLevelContext, type SectionLevel } from "./section-level.ts";
import { RECORD_META_HOLD } from "../record-first-view.ts";

/** Whether a record's sheet is on screen, and what follows once it has left. */
export interface SheetState {
  readonly open: boolean;
  onClose(): void;
}

/**
 * How a record is shown: over the page it was opened from inside the app, or as a page of its own
 * when it was opened from a link (22 November 2026).
 */
export type Presentation = "sheet" | "page";

/** The level a record's sections start at as it is shown: under a sheet's title or a page's heading. */
export const recordSectionLevel = (presentation: Presentation): SectionLevel => (presentation === "page" ? 2 : 3);

/**
 * A record opened over its list. The list stays as it was underneath, so closing returns to the
 * same filters and the same place on the page. Opened from a link, the same record is the page,
 * under its own heading, and the app bar's back link goes to its list.
 */
export function DetailSheet({
  title,
  state,
  presentation = "sheet",
  wide = false,
  children,
}: {
  title: string;
  state: SheetState;
  presentation?: Presentation;
  /** As a page, take the page's width, for a record whose parts sit beside each other (DL-151). */
  wide?: boolean;
  children: ReactNode;
}) {
  if (presentation === "page") {
    const body = (
      <>
        <Heading level={1} size="page">
          {title}
        </Heading>
        <SectionLevelContext value={2}>{children}</SectionLevelContext>
      </>
    );
    return wide ? <ListLayout>{body}</ListLayout> : <NarrowLayout>{body}</NarrowLayout>;
  }
  return (
    <Dialog
      presentation="detail"
      title={title}
      open={state.open}
      leaves
      onClose={() => {
        keepFocusOnPage();
        state.onClose();
      }}
    >
      <SectionLevelContext value={3}>{children}</SectionLevelContext>
    </Dialog>
  );
}

/**
 * The first lines of a record that came with its page (GET /api/record-page): the room of the line the
 * loaded record shows under its heading, then its summary, as the server drew them, so neither moves
 * when the app takes over or when the record arrives.
 */
export function RecordLead({ summary }: { summary: string }) {
  return (
    <>
      <p className="rc-card-meta" aria-hidden="true">
        <span className="rc-skeleton" data-shape="hold">
          {RECORD_META_HOLD}
        </span>
      </p>
      {summary && <p className="rc-prose">{summary}</p>}
    </>
  );
}

/**
 * A record opening: the shape of its first screen (a line about it, its words, its actions and a
 * section), as tall as a phone's screen. A record's page and its sheet open at about their final height,
 * so nothing below the record shows and then moves when it arrives (quality finding Q-05). A page
 * holds its footer back until the record is in (`data-loading="record"`).
 */
export function RecordSkeleton({ label }: { label: string }) {
  return (
    <div className="rc-stack" aria-busy="true" data-loading="record">
      <p className="rc-visually-hidden" role="status">
        {label}
      </p>
      <span className="rc-skeleton" data-shape="short" />
      <span className="rc-skeleton" data-shape="panel" />
      <span className="rc-skeleton" data-shape="line" />
      <span className="rc-skeleton" data-shape="line" />
      <span className="rc-skeleton" data-shape="short" />
      <span className="rc-skeleton" data-shape="panel" />
      <span className="rc-skeleton" data-shape="title" />
      <span className="rc-skeleton" data-shape="panel" />
    </div>
  );
}

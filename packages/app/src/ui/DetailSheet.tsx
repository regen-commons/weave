import type { ReactNode } from "react";
import { Dialog } from "./Dialog.tsx";
import { Heading } from "./Heading.tsx";
import { NarrowLayout } from "./layouts.tsx";
import { keepFocusOnPage } from "./focus.ts";

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

/**
 * A record opened over its list. The list stays as it was underneath, so closing returns to the
 * same filters and the same place on the page. Opened from a link, the same record is the page,
 * under its own heading, and the app bar's back link goes to its list.
 */
export function DetailSheet({
  title,
  state,
  presentation = "sheet",
  children,
}: {
  title: string;
  state: SheetState;
  presentation?: Presentation;
  children: ReactNode;
}) {
  if (presentation === "page")
    return (
      <NarrowLayout>
        <Heading level={1} size="page">
          {title}
        </Heading>
        {children}
      </NarrowLayout>
    );
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
      {children}
    </Dialog>
  );
}

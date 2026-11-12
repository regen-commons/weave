import type { ReactNode } from "react";
import { Dialog } from "./Dialog.tsx";
import { keepFocusOnPage } from "./focus.ts";

/** Whether a record's sheet is on screen, and what follows once it has left. */
export interface SheetState {
  readonly open: boolean;
  onClose(): void;
}

/**
 * A record opened over its list. The list stays as it was underneath, so closing returns to the
 * same filters and the same place on the page.
 */
export function DetailSheet({ title, state, children }: { title: string; state: SheetState; children: ReactNode }) {
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

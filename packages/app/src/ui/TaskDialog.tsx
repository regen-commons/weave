import { useEffect, useRef, type ReactNode } from "react";
import { Dialog } from "./Dialog.tsx";
import { keepFocusOnPage } from "./focus.ts";

/**
 * Explicit small task. A finished task can remove its invoker, and the page heading takes the
 * focus then. Its content leaves with it, so a finished task closes at once.
 */
export function TaskDialog({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const shown = useRef(false);
  useEffect(() => {
    if (open && !shown.current)
      ref.current?.querySelector<HTMLElement>("[data-task-focus]:not(:disabled)")?.focus();
    shown.current = open;
  }, [open]);
  useEffect(
    () => () => {
      // The task can take this dialog away with its invoker, and then no close event arrives.
      if (shown.current) keepFocusOnPage();
    },
    [],
  );
  return (
    <Dialog
      ref={ref}
      presentation="task"
      title={title}
      open={open}
      onClose={() => {
        keepFocusOnPage();
        onClose();
      }}
    >
      {open && children}
    </Dialog>
  );
}

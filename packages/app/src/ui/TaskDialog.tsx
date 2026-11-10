import { useEffect, useId, useRef, type ReactNode } from "react";
import { keepFocusOnPage } from "./focus.ts";

/**
 * Explicit small task: native focus containment, Escape and return to the invoker.
 * A finished task can remove its invoker, and the page heading takes the focus then.
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
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-task-focus]:not(:disabled)")?.focus();
    }
    if (!open && dialog.open) dialog.close();
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
    <dialog
      className="rc-dialog"
      data-presentation="task"
      ref={ref}
      aria-labelledby={id}
      onClose={() => {
        keepFocusOnPage();
        onClose();
      }}
    >
      <div className="rc-dialog-body">
        <div className="rc-dialog-head">
          <h2 className="rc-dialog-title" id={id}>
            {title}
          </h2>
          <form method="dialog">
            <button className="rc-button" data-variant="secondary" type="submit">
              Close
            </button>
          </form>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}

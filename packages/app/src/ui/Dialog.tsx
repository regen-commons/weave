import { connectSheet, type Sheet } from "@regen-commons/design-system/sheet";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

/**
 * The one native dialog: a centred modal on a wide screen and a bottom sheet on a phone, where the
 * grip, the title row and the content at its top pull it away, and it stands on the on-screen
 * keyboard (DL-091). Focus containment, Escape and the return to the invoker are the browser's
 * own. A press outside closes every dialog, a task included (DL-082); one whose work is under way
 * asks to stay open with `blockClose` and says why.
 */
export function Dialog({
  ref,
  presentation,
  title,
  open,
  leaves = false,
  onClose,
  children,
  blockClose = false,
  onCloseBlocked,
}: {
  ref?: RefObject<HTMLDialogElement | null>;
  presentation: "information" | "task" | "detail";
  title: string;
  open: boolean;
  /** Plays the leaving motion when `open` turns false. Off where the content leaves with it. */
  leaves?: boolean;
  /** The dialog has closed, by hand or because `open` turned false. */
  onClose(): void;
  children: ReactNode;
  blockClose?: boolean;
  onCloseBlocked?(): void;
}) {
  const own = useRef<HTMLDialogElement>(null);
  const dialog = ref ?? own;
  const sheet = useRef<Sheet | null>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const connected = connectSheet(element, { lightDismiss: true });
    sheet.current = connected;
    return () => {
      sheet.current = null;
      connected.dispose();
    };
  }, [dialog]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) {
      if (leaves && sheet.current) sheet.current.close();
      else element.close();
    }
  }, [dialog, open, leaves]);
  return (
    <dialog className="rc-dialog" data-presentation={presentation} ref={dialog} aria-labelledby={id}
      onCancel={event => { if (blockClose) { event.preventDefault(); onCloseBlocked?.(); } }}
      // React passes a dialog's close up through its tree; one opened inside this one is not this one closing.
      onClose={(event) => {
        if (event.target === event.currentTarget) {
          if (blockClose && open) { event.currentTarget.showModal(); onCloseBlocked?.(); }
          else onClose();
        }
      }}
    >
      <div className="rc-dialog-grip" data-sheet-handle aria-hidden="true" />
      <div className="rc-dialog-body">
        <div className="rc-dialog-head" data-sheet-handle>
          <h2 className="rc-dialog-title" id={id}>
            {title}
          </h2>
          {/* While the dialog's work is under way, Close says why it stays rather than submitting: the
              sheet behaviour closes on a dialog form's submit before React's handler could refuse it. */}
          <form method="dialog">
            <button
              className="rc-button"
              data-variant="secondary"
              type={blockClose ? "button" : "submit"}
              onClick={blockClose ? () => onCloseBlocked?.() : undefined}
            >
              Close
            </button>
          </form>
        </div>
        {children}
      </div>
    </dialog>
  );
}

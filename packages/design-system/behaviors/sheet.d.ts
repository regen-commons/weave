export interface Sheet {
  /** Plays the leaving motion, then closes the dialog. The dialog's `close` event follows. */
  close(): void;
  dispose(): void;
}
/**
 * Give a native dialog its leaving motion and, where it shows as a bottom sheet, a drag to dismiss:
 * from its grip and title row, and from its content where that is at its top. A sheet also stands
 * on the on-screen keyboard, so the field being typed in stays in view (DL-091).
 * `lightDismiss` also closes it on a press outside. Dispose on unmount.
 */
export function connectSheet(dialog: HTMLDialogElement, options?: { lightDismiss?: boolean }): Sheet;

export interface Sheet {
  /** Plays the leaving motion, then closes the dialog. The dialog's `close` event follows. */
  close(): void;
  dispose(): void;
}
/**
 * Give a native dialog its leaving motion and, where it shows as a bottom sheet, a drag to dismiss.
 * `lightDismiss` also closes it on a press outside. Dispose on unmount.
 */
export function connectSheet(dialog: HTMLDialogElement, options?: { lightDismiss?: boolean }): Sheet;

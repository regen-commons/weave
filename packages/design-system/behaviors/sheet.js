// Sheet behaviour shared by React and the static pattern library: a dialog that leaves with
// the same motion it arrived with, and follows a finger dragged down from its grip or head.
// The motion itself lives in organisms.css; this file only says when it runs.
const INTERACTIVE = "a, button, input, select, textarea, summary";
/** A release past this share of the sheet's height dismisses it. */
const DISMISS_SHARE = 0.3;
/** A flick faster than this, in pixels per millisecond, dismisses it from any height. */
const FLICK_SPEED = 0.6;
/** The leaving motion never holds a close longer than this, in milliseconds, even where the page is not being drawn. */
const LEAVE_LIMIT = 600;

export function connectSheet(dialog, { lightDismiss = false } = {}) {
  const dispose = [];
  let closing = false;
  function on(target, name, listener, options) {
    target.addEventListener(name, listener, options);
    dispose.push(() => target.removeEventListener(name, listener, options));
  }
  function reset() {
    closing = false;
    delete dialog.dataset.closing;
    delete dialog.dataset.settling;
    dialog.style.removeProperty("--sheet-drag");
  }
  /** Plays the leaving motion, then closes. With reduced motion nothing plays and it closes at once. */
  function close() {
    if (closing || !dialog.open) return;
    closing = true;
    dialog.dataset.closing = "";
    const left = Promise.allSettled(dialog.getAnimations().map((animation) => animation.finished));
    const limit = new Promise((resolve) => setTimeout(resolve, LEAVE_LIMIT));
    Promise.race([left, limit]).then(() => {
      if (closing && dialog.open) dialog.close();
    });
  }
  on(dialog, "close", reset);
  // Escape, and a tap outside where the browser handles one.
  on(dialog, "cancel", (event) => {
    if (!event.cancelable) return;
    event.preventDefault();
    close();
  });
  // Events from a dialog opened inside this one bubble through it and are that dialog's own.
  const own = (event) => event.target.closest?.("dialog") === dialog;
  on(dialog, "submit", (event) => {
    if (!own(event) || event.target.getAttribute("method") !== "dialog") return;
    event.preventDefault();
    close();
  });
  if (lightDismiss) {
    if ("closedBy" in HTMLDialogElement.prototype) dialog.setAttribute("closedby", "any");
    else {
      // The backdrop belongs to the dialog, so a press outside its box lands on the dialog itself.
      const outside = (event) => {
        const box = dialog.getBoundingClientRect();
        return (
          event.target === dialog &&
          (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)
        );
      };
      let pressedOutside = false;
      on(dialog, "pointerdown", (event) => (pressedOutside = outside(event)));
      on(dialog, "click", (event) => {
        if (pressedOutside && outside(event)) close();
      });
    }
  }

  let drag = null;
  on(dialog, "pointerdown", (event) => {
    const handle = own(event) ? event.target.closest("[data-sheet-handle]") : null;
    const grip = dialog.querySelector(":scope > .rc-dialog-grip");
    // The grip shows only where the dialog is a bottom sheet, so a wide dialog does not drag.
    if (!handle || !grip || getComputedStyle(grip).display === "none" || closing) return;
    if (!event.isPrimary || event.button !== 0 || event.target.closest(INTERACTIVE)) return;
    drag = { id: event.pointerId, start: event.clientY, last: event.clientY, at: event.timeStamp, speed: 0 };
    handle.setPointerCapture?.(event.pointerId);
    delete dialog.dataset.settling;
  });
  on(dialog, "pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const elapsed = event.timeStamp - drag.at;
    if (elapsed > 0) drag.speed = (event.clientY - drag.last) / elapsed;
    drag.last = event.clientY;
    drag.at = event.timeStamp;
    dialog.style.setProperty("--sheet-drag", `${Math.max(0, event.clientY - drag.start)}px`);
  });
  function release(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = Math.max(0, drag.last - drag.start);
    const flicked = drag.speed > FLICK_SPEED && moved > 0;
    drag = null;
    if (event.type === "pointerup" && (flicked || moved > dialog.getBoundingClientRect().height * DISMISS_SHARE)) {
      close();
      return;
    }
    // Not far enough: the sheet settles back where it was.
    dialog.dataset.settling = "";
    dialog.style.setProperty("--sheet-drag", "0px");
  }
  on(dialog, "pointerup", release);
  on(dialog, "pointercancel", release);
  on(dialog, "transitionend", (event) => {
    if (event.target === dialog && "settling" in dialog.dataset) reset();
  });
  return {
    close,
    dispose: () => {
      reset();
      dispose.forEach((fn) => fn());
    },
  };
}

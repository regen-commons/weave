// Sheet behaviour shared by React and the static pattern library: a dialog that leaves with
// the same motion it arrived with, follows a finger dragged down from its grip or head, or from
// its content where that is at its top, and stands on the on-screen keyboard (DL-091).
// The motion itself lives in organisms.css; this file only says when it runs.
const INTERACTIVE = "a, button, input, select, textarea, summary";
/** Where a finger places a caret, picks a value or drags a slider, so it never pulls the sheet. */
const TYPING = 'textarea, select, input:not([type="checkbox"], [type="radio"])';
/** A release past this share of the sheet's height dismisses it. */
const DISMISS_SHARE = 0.3;
/** A flick faster than this, in pixels per millisecond, dismisses it from any height. */
const FLICK_SPEED = 0.6;
/** A flick travels at least this far, in pixels. A press that wobbles is quick too, and is not one. */
const FLICK_TRAVEL = 24;
/** A finger on the content moves this far, in pixels, before anyone takes the gesture. Less is a press. */
const PULL_SLOP = 6;
/** The leaving motion never holds a close longer than this, in milliseconds, even where the page is not being drawn. */
const LEAVE_LIMIT = 600;
/** An on-screen keyboard is never this short, in pixels. What a browser's own bars cover can be. */
const KEYBOARD_MIN = 100;

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
    dialog.style.removeProperty("--sheet-keyboard");
    dialog.style.removeProperty("--sheet-room");
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

  /** The grip shows only where the dialog is a bottom sheet, so a wide dialog neither drags nor lifts. */
  function isSheet() {
    const grip = dialog.querySelector(":scope > .rc-dialog-grip");
    return !!grip && getComputedStyle(grip).display !== "none";
  }
  /** A finger on the sheet: where it started, where it is now and how fast it is moving down. */
  let drag = null;
  function follow(y, at) {
    const elapsed = at - drag.at;
    if (elapsed > 0) drag.speed = (y - drag.last) / elapsed;
    drag.last = y;
    drag.at = at;
    dialog.style.setProperty("--sheet-drag", `${Math.max(0, y - drag.start)}px`);
  }
  /** The finger has left. A lifted finger dismisses a sheet pulled far or flicked; a gesture the browser took away never does. */
  function letGo(lifted) {
    const moved = Math.max(0, drag.last - drag.start);
    const flicked = drag.speed > FLICK_SPEED && moved > FLICK_TRAVEL;
    drag = null;
    if (lifted && (flicked || moved > dialog.getBoundingClientRect().height * DISMISS_SHARE)) {
      close();
      return;
    }
    // Not far enough: the sheet settles back where it was.
    dialog.dataset.settling = "";
    dialog.style.setProperty("--sheet-drag", "0px");
  }

  // The grip and the title row are handles. They take no pan of their own (`touch-action: none`),
  // so a pointer on one drags the sheet from the first move.
  on(dialog, "pointerdown", (event) => {
    const handle = own(event) ? event.target.closest("[data-sheet-handle]") : null;
    if (!handle || drag || closing || !isSheet()) return;
    if (!event.isPrimary || event.button !== 0 || event.target.closest(INTERACTIVE)) return;
    drag = { pointer: event.pointerId, start: event.clientY, last: event.clientY, at: event.timeStamp, speed: 0 };
    handle.setPointerCapture?.(event.pointerId);
    delete dialog.dataset.settling;
  });
  on(dialog, "pointermove", (event) => {
    if (drag && event.pointerId === drag.pointer) follow(event.clientY, event.timeStamp);
  });
  function release(event) {
    if (drag && event.pointerId === drag.pointer) letGo(event.type === "pointerup");
  }
  on(dialog, "pointerup", release);
  on(dialog, "pointercancel", release);

  // The content pulls the sheet too, where it is at its top: a finger moving down there has
  // nothing to scroll back to. These are touch events because the browser gives a pan on the
  // content to scrolling and cancels the pointer, and only the first touchmove can refuse that.
  // A finger that starts up or sideways, or on content that is scrolled, is the content's, and
  // one that has barely moved is still a press.
  const atTop = (target) => {
    for (let element = target; element; element = element === dialog ? null : element.parentElement) {
      if (element.scrollTop > 0) return false;
    }
    return true;
  };
  const touchOf = (event) => [...event.changedTouches].find((touch) => touch.identifier === drag?.touch);
  on(dialog, "touchstart", (event) => {
    if (drag || closing || event.touches.length !== 1 || !own(event) || !isSheet()) return;
    if (event.target.closest(`[data-sheet-handle], ${TYPING}`)) return;
    const [touch] = event.touches;
    drag = { touch: touch.identifier, x: touch.clientX, start: touch.clientY, last: touch.clientY, at: event.timeStamp, speed: 0, pulling: false };
  }, { passive: true });
  on(dialog, "touchmove", (event) => {
    const touch = touchOf(event);
    if (!touch) return;
    if (!drag.pulling) {
      const down = touch.clientY - drag.start;
      const across = Math.abs(touch.clientX - drag.x);
      if (!event.cancelable || !atTop(event.target)) {
        drag = null;
        return;
      }
      if (Math.max(across, Math.abs(down)) < PULL_SLOP) return;
      if (down < 0 || across > Math.abs(down)) {
        drag = null;
        return;
      }
      // The sheet starts from where the finger is now, so it does not jump by the slop.
      drag.pulling = true;
      drag.start = touch.clientY;
      delete dialog.dataset.settling;
    }
    // The sheet has the gesture, so the content neither scrolls nor bounces under it.
    event.preventDefault();
    follow(touch.clientY, event.timeStamp);
  }, { passive: false });
  function lift(event) {
    if (!touchOf(event)) return;
    if (drag.pulling) letGo(event.type === "touchend");
    else drag = null;
  }
  on(dialog, "touchend", lift);
  on(dialog, "touchcancel", lift);

  // The on-screen keyboard. A phone draws it over the bottom of the window and leaves the layout
  // as it was, so a sheet at the bottom edge would keep its lower half, and the field being typed
  // in, under the keys. The visual viewport says what is still in view: the sheet stands on the
  // keyboard (--sheet-keyboard), is no taller than what is left (--sheet-room), and keeps the
  // field in view. Zoomed in, less is in view for another reason and the sheet stays put.
  const viewport = globalThis.visualViewport;
  function stand() {
    const covered = Math.round(globalThis.innerHeight - viewport.height - viewport.offsetTop);
    if (!dialog.open || covered < KEYBOARD_MIN || Math.abs(viewport.scale - 1) > 0.01 || !isSheet()) {
      dialog.style.removeProperty("--sheet-keyboard");
      dialog.style.removeProperty("--sheet-room");
      return;
    }
    dialog.style.setProperty("--sheet-keyboard", `${covered}px`);
    dialog.style.setProperty("--sheet-room", `${Math.round(viewport.height)}px`);
    const field = dialog.ownerDocument.activeElement;
    if (field && field !== dialog && dialog.contains(field)) field.scrollIntoView({ block: "nearest" });
  }
  if (viewport) {
    on(viewport, "resize", stand);
    on(viewport, "scroll", stand);
  }
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

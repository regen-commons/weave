// Platform enhancement shared by React and the static pattern library. All listeners
// and delayed hides belong to the returned disposer; no polyfill or network request.
/** Room enough under a trigger to read a few rows of a menu, in CSS pixels. */
const READABLE = 240;

/**
 * Where a panel opens against its trigger, and how tall it may grow. It opens under the trigger
 * when it fits there and over it when it fits only there. When it fits neither side it stays under
 * the trigger while a few rows can be read there, and otherwise takes the roomier side. Either way
 * it scrolls inside, so it never covers its trigger or runs off the window.
 */
export function blockPlacement({ triggerTop, triggerBottom, panelHeight, windowHeight, gap }) {
  const below = triggerBottom + gap;
  const roomBelow = Math.max(0, windowHeight - gap - below);
  const roomAbove = Math.max(0, triggerTop - gap * 2);
  if (panelHeight <= roomBelow) return { top: below, maxBlock: roomBelow };
  if (panelHeight <= roomAbove) return { top: triggerTop - gap - panelHeight, maxBlock: roomAbove };
  return roomBelow >= READABLE || roomBelow >= roomAbove
    ? { top: below, maxBlock: roomBelow }
    : { top: gap, maxBlock: roomAbove };
}

/**
 * Where a panel sits across the window against its trigger. It starts at the trigger's own start
 * edge, or ends at the trigger's end edge when the panel asks to (`data-align="end"`), as a menu
 * at the end of a bar does. Either way it stays inside the window.
 */
export function inlinePlacement({ triggerLeft, triggerRight, panelWidth, windowWidth, gap, align = "start" }) {
  const wanted = align === "end" ? triggerRight - panelWidth : triggerLeft;
  return Math.max(gap, Math.min(wanted, windowWidth - panelWidth - gap));
}

function place(trigger, panel) {
  const rect = trigger.getBoundingClientRect();
  const style = getComputedStyle(panel);
  const margin = parseFloat(style.marginLeft) || 0;
  const gap = parseFloat(style.paddingTop) || 0;
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  panel.style.setProperty("--popover-max-block", `${Math.max(0, height - gap * 4)}px`);
  const box = panel.getBoundingClientRect();
  const left = inlinePlacement({
    triggerLeft: rect.left,
    triggerRight: rect.right,
    panelWidth: box.width,
    windowWidth: width,
    gap,
    align: panel.dataset.align,
  });
  // The height above is the panel's own, measured with the whole window to grow into.
  const { top, maxBlock } = blockPlacement({
    triggerTop: rect.top,
    triggerBottom: rect.bottom,
    panelHeight: box.height,
    windowHeight: height,
    gap,
  });
  panel.style.setProperty("--popover-max-block", `${maxBlock}px`);
  panel.style.setProperty("--popover-left", `${left - margin}px`);
  panel.style.setProperty("--popover-top", `${top - margin}px`);
}

function overlay(trigger, panel) {
  const native = typeof panel.showPopover === "function";
  let opened = false;
  let changed = () => {};
  const dispose = [];
  function on(target, name, listener, options) {
    target.addEventListener(name, listener, options);
    dispose.push(() => target.removeEventListener(name, listener, options));
  }
  function isOpen() {
    return native ? panel.matches(":popover-open") : opened;
  }
  function open() {
    if (isOpen()) return;
    if (native) panel.showPopover();
    else {
      opened = true;
      panel.hidden = false;
      panel.dataset.open = "";
      changed();
    }
    place(trigger, panel);
  }
  function close() {
    if (!isOpen()) return;
    if (native) panel.hidePopover();
    else {
      opened = false;
      panel.hidden = true;
      delete panel.dataset.open;
      changed();
    }
  }
  if (!native) {
    panel.removeAttribute("popover");
    panel.hidden = true;
  }
  on(window, "resize", () => {
    if (!isOpen()) return;
    // A trigger that the new width's layout hides takes its panel with it.
    if (trigger.getClientRects().length === 0) close();
    else place(trigger, panel);
  });
  on(
    window,
    "scroll",
    () => {
      if (isOpen()) place(trigger, panel);
    },
    true,
  );
  on(panel, "toggle", (event) => {
    if (event.newState === "open") place(trigger, panel);
  });
  return {
    native,
    on,
    isOpen,
    open,
    close,
    /** Without the Popover API no toggle event says the panel opened or closed; this does. */
    onChange(listener) {
      changed = listener;
    },
    dispose: () => {
      close();
      dispose.forEach((fn) => fn());
    },
  };
}

export function connectTooltip(trigger, panel) {
  const ui = overlay(trigger, panel);
  const nativeInterest = ui.native && "interestForElement" in HTMLButtonElement.prototype;
  let timer;
  let frame;
  let dismissed = false;
  if (nativeInterest) {
    panel.popover = "hint";
    trigger.setAttribute("interestfor", panel.id);
    ui.on(panel, "toggle", (event) => {
      if (event.newState === "open") frame = requestAnimationFrame(() => place(trigger, panel));
    });
  } else {
    if (ui.native) panel.popover = "manual";
    panel.setAttribute("role", "tooltip");
    trigger.setAttribute("aria-describedby", panel.id);
    const cancel = () => clearTimeout(timer);
    const show = () => {
      cancel();
      if (!dismissed) ui.open();
    };
    const delay =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--duration-base")) || 0;
    const leave = () => {
      cancel();
      timer = setTimeout(() => {
        if (!trigger.matches(":focus") && !panel.matches(":hover")) ui.close();
      }, delay);
    };
    for (const element of [trigger, panel]) {
      ui.on(element, "pointerenter", show);
      ui.on(element, "pointerleave", () => {
        dismissed = false;
        leave();
      });
      ui.on(element, "focusin", show);
      ui.on(element, "focusout", (event) => {
        if (!trigger.contains(event.relatedTarget) && !panel.contains(event.relatedTarget)) {
          dismissed = false;
          ui.close();
        }
      });
    }
    ui.on(trigger, "click", show);
    ui.on(document, "keydown", (event) => {
      if (event.key === "Escape" && ui.isOpen()) {
        dismissed = true;
        cancel();
        ui.close();
      }
    });
    ui.on(document, "pointerdown", (event) => {
      if (!trigger.contains(event.target) && !panel.contains(event.target)) ui.close();
    });
  }
  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    ui.dispose();
  };
}

export function connectPopover(trigger, panel) {
  const ui = overlay(trigger, panel);
  const sync = () => trigger.setAttribute("aria-expanded", String(ui.isOpen()));
  if (ui.native) panel.popover = "auto";
  else trigger.removeAttribute("popovertarget");
  trigger.setAttribute("aria-controls", panel.id);
  sync();
  ui.onChange(sync);
  // Focus goes to the first thing in the panel to act on: a control, or a link in a menu of places.
  const first = () => panel.querySelector("a[href], input, select, button");
  ui.on(panel, "toggle", (event) => {
    sync();
    if (event.newState === "open") first()?.focus({ preventScroll: true });
  });
  if (!ui.native) {
    ui.on(trigger, "click", () => {
      if (ui.isOpen()) ui.close();
      else {
        ui.open();
        first()?.focus();
      }
      sync();
    });
    ui.on(document, "pointerdown", (event) => {
      if (!trigger.contains(event.target) && !panel.contains(event.target)) {
        ui.close();
        sync();
      }
    });
    ui.on(document, "keydown", (event) => {
      if (event.key === "Escape" && ui.isOpen()) {
        ui.close();
        sync();
        trigger.focus();
      }
    });
  }
  ui.on(panel, "click", (event) => {
    if (event.target.closest("[data-close-popover]")) {
      ui.close();
      sync();
      trigger.focus();
    }
  });
  return ui.dispose;
}

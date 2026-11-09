// Platform enhancement shared by React and the static pattern library. All listeners
// and delayed hides belong to the returned disposer; no polyfill or network request.
function place(trigger, panel) {
  const rect = trigger.getBoundingClientRect();
  const style = getComputedStyle(panel);
  const margin = parseFloat(style.marginLeft) || 0;
  const gap = parseFloat(style.paddingTop) || 0;
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  panel.style.setProperty("--popover-max-block", `${Math.max(0, height - gap * 4)}px`);
  const box = panel.getBoundingClientRect();
  const left = Math.max(gap, Math.min(rect.left, width - box.width - gap));
  const below = rect.bottom + gap;
  const top = below + box.height <= height - gap ? below : Math.max(gap, rect.top - box.height - gap);
  panel.style.setProperty("--popover-left", `${left - margin}px`);
  panel.style.setProperty("--popover-top", `${top - margin}px`);
}

function overlay(trigger, panel) {
  const native = typeof panel.showPopover === "function";
  let opened = false;
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
    }
  }
  if (!native) {
    panel.removeAttribute("popover");
    panel.hidden = true;
  }
  on(window, "resize", () => {
    if (isOpen()) place(trigger, panel);
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
  ui.on(panel, "toggle", (event) => {
    sync();
    if (event.newState === "open")
      panel.querySelector("input, select, button")?.focus({ preventScroll: true });
  });
  if (!ui.native) {
    ui.on(trigger, "click", () => {
      if (ui.isOpen()) ui.close();
      else {
        ui.open();
        panel.querySelector("input, select, button")?.focus();
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

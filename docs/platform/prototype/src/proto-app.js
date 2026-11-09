/* Weave prototype controller: the control bar, screen and state switching, theme and width, sheets, menus and tooltips, the simulated assistant and network, and every product action.
   Nothing here calls a model or a service. Nothing typed is sent or stored beyond this page's memory, except the theme and width choices in localStorage for convenience. */
(function () {
  const D = window.WeaveData;
  const S = window.WeaveScreens;
  const H = window.WeaveH;

  const ORDER = ["home", "step1", "step1-download", "step1-consent", "card", "step2", "step3", "finish", "partners-before", "partners-after", "opportunities", "opportunity", "email", "code", "saved", "share", "merge", "directory", "initiative", "settings", "ledger", "privacy"];
  const GROUPS = ["Arrive", "Describe", "Matches", "Save", "Browse"];
  const PERSIST_UI = ["opportunity", "initiative", "filters", "team"];

  const newSession = () => ({
    hasDraft: false,
    saved: false,
    visibility: "private",
    email: "ana@example.org",
    ai: "keywords",
    modelReady: false,
    modelBuiltIn: false,
    modelSkipped: false,
    speechReady: false,
    cloudConsent: "none",
    convo: { initiative: H.seedTurns("initiative", "default"), need: H.seedTurns("need", "default"), offer: H.seedTurns("offer", "default") },
    notify: { reminders: true, partners: true, intros: true },
    kept: {},
    removed: {},
    titles: {},
    added: { need: [], offer: [] },
    derivedKept: {},
    removedDerived: {},
    removedValues: {},
    overrides: {},
    intros: {},
    dismissed: {},
    reminders: {},
    notNow: {},
  });

  const app = { screen: "home", state: "default", width: "phone", theme: "system", s: newSession(), ui: {}, timers: [], flowTimers: [], history: [], ready: false, pendingFlash: null };
  window.WeaveApp = app;

  const $ = (sel) => document.querySelector(sel);
  const frame = $("#proto-frame");
  const stage = $("#proto-stage");
  const dialog = $("#proto-dialog");
  const toastLayer = $("#proto-toast");
  const screenSelect = $("#proto-screen");
  const stateSelect = $("#proto-state");
  const frameLabel = $("#proto-frame-label");
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tier = () => D.tiers[app.width === "phone" ? "phone" : "desktop"];

  // ----- Context given to every render -----
  function cloneMe(base) {
    const me = JSON.parse(JSON.stringify(base));
    const rv = app.s.removedValues;
    const drop = (list, key) => (rv[key] ? list.filter((x) => !rv[key].includes(typeof x === "string" ? x : x.name)) : list);
    me.locations = drop(me.locations, "location");
    me.links = drop(me.links, "link");
    me.derived.themes = drop(me.derived.themes, "themes");
    me.derived.languages = drop(me.derived.languages, "languages");
    me.derived.places = drop(me.derived.places, "place");
    if (app.s.overrides.stage) me.derived.stage = app.s.overrides.stage;
    if (app.s.overrides.lenses) me.derived.lenses = app.s.overrides.lenses;
    if (app.s.overrides.beneficiaries) me.derived.beneficiaries = app.s.overrides.beneficiaries;
    const apply = (list) => list.map((i) => (app.s.titles[i.id] ? Object.assign({}, i, app.s.titles[i.id]) : i));
    me.needs = apply(me.needs).concat(app.s.added.need.map((i) => (app.s.titles[i.id] ? Object.assign({}, i, app.s.titles[i.id]) : i)));
    me.offers = apply(me.offers).concat(app.s.added.offer.map((i) => (app.s.titles[i.id] ? Object.assign({}, i, app.s.titles[i.id]) : i)));
    return me;
  }
  const ctx = () => ({ state: app.state, s: app.s, ui: app.ui, width: app.width, theme: app.theme, me: cloneMe(app.state === "long" ? D.meLong : D.me) });

  // ----- Rendering -----
  // In the 360 px frame on a wide window the frame is its own scroller. On a phone, and at desktop width, the page scrolls.
  const frameScrolls = () => ["auto", "scroll"].includes(getComputedStyle(frame).overflowY);
  function scrollToTop() {
    if (frameScrolls()) { frame.scrollTo(0, 0); return; }
    const bar = $(".proto-bar");
    const barH = bar && getComputedStyle(bar).position === "sticky" ? bar.offsetHeight : 0;
    const top = Math.max(0, frame.getBoundingClientRect().top + window.scrollY - barH);
    if (window.scrollY > top) window.scrollTo(0, top);
  }

  function renderNow(opts) {
    clearTimers();
    const def = S[app.screen];
    const c = ctx();
    if (c.ui.flash === undefined && app.pendingFlash) { c.ui.flash = app.pendingFlash; app.pendingFlash = null; }
    const focusId = document.activeElement && frame.contains(document.activeElement) ? document.activeElement.id : null;
    frame.innerHTML = def.render(c);
    if (opts.scrollTop) scrollToTop();
    if (opts.focusHeading) {
      const h = frame.querySelector("h1");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    } else if (focusId) {
      const el = document.getElementById(focusId);
      if (el) el.focus({ preventScroll: true });
    }
    wireTooltips(frame);
    startScreenTimers();
    Backdrop.mount(frame.querySelector(".rcp-backdrop-canvas"));
    if (opts.syncDialog) {
      const want = typeof def.dialog === "function" ? def.dialog(c) : def.dialog ? { kind: def.dialog } : null;
      if (want) { want.fromScreen = true; openSheet(want, handlerFor(want)); }
      else if (dialog.open) closeNow("nav");
    } else if (dialog.open && sheet) refreshSheet();
  }
  // Screen changes cross-fade where the browser supports view transitions; if a transition has not started within a moment, the screen renders anyway.
  function render(opts = {}) {
    if (!(opts.transition && app.ready && document.startViewTransition && !reduceMotion() && !dialog.open && document.visibilityState === "visible")) { renderNow(opts); return; }
    let done = false;
    const run = () => { if (done) return; done = true; renderNow(opts); };
    const vt = document.startViewTransition(run);
    setTimeout(() => { if (!done) { try { vt.skipTransition(); } catch (e) { /* already finished */ } run(); } }, 250);
  }

  function go(id, opts = {}) {
    if (!S[id]) id = "home";
    if (app.screen !== id) app.history.push(app.screen);
    if (dialog.open) closeNow("nav");
    stopResend();
    app.screen = id;
    const def = S[id];
    if (!def.states[app.state] || opts.fromList) app.state = opts.state || "default";
    if (def.preset && opts.fromList !== false) def.preset(app.s, !!opts.fromList, app.state);
    // A reviewer who jumps past step 1 sees the assistant as if it had been downloaded. Walking through the product keeps whatever the person chose.
    if (opts.fromList && id !== "home" && !id.startsWith("step1") && !app.s.modelSkipped && !app.s.modelReady && app.s.ai === "keywords") { app.s.modelReady = true; app.s.ai = "device"; }
    const keep = {};
    PERSIST_UI.forEach((k) => { if (app.ui[k] !== undefined) keep[k] = app.ui[k]; });
    app.ui = keep;
    if (opts.ui) Object.assign(app.ui, opts.ui);
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* the viewer may refuse */ }
    syncBar();
    render({ scrollTop: true, focusHeading: app.ready, syncDialog: true, transition: true });
  }

  // Leave a sheet screen for the page underneath, so the control bar matches what is on screen.
  function settleToBase() {
    const def = S[app.screen];
    if (!def.base) { if (def.dialog && app.state !== "default") { app.state = "default"; syncBar(); render(); } return; }
    app.screen = def.base(app.s);
    app.state = "default";
    try { history.replaceState(null, "", "#" + app.screen); } catch (e) { /* ignore */ }
    syncBar();
    render();
  }

  // ----- Timers -----
  // Screen timers end with every render. Flow timers carry a step across renders and end on reset.
  function clearTimers() { app.timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); app.timers = []; }
  function every(ms, fn) { const t = setInterval(fn, ms); app.timers.push(t); return t; }
  function flowAfter(ms, fn) { const t = setTimeout(() => { app.flowTimers = app.flowTimers.filter((x) => x !== t); fn(); }, ms); app.flowTimers.push(t); return t; }
  function clearFlow() { app.flowTimers.forEach((t) => clearTimeout(t)); app.flowTimers = []; }

  let resendTimer = null;
  function startResend() {
    stopResend();
    if (!(app.ui.resendIn > 0)) return;
    resendTimer = setInterval(() => {
      app.ui.resendIn -= 1;
      const el = document.getElementById("resend-wait");
      if (app.ui.resendIn > 0) { if (el) el.textContent = `New code in ${app.ui.resendIn} s`; }
      else { app.ui.resendIn = 0; stopResend(); if (dialog.open) refreshSheet(); else render(); }
    }, 1000);
  }
  function stopResend() { if (resendTimer) clearInterval(resendTimer); resendTimer = null; }

  function startScreenTimers() {
    if (app.ui.recording) startRecordingClock();
    if (app.ui.download) startDownload(app.ui.download);
    if (app.ui.building) startBuilding();
  }

  function startDownload(kind) {
    const t = tier();
    const sizeText = kind === "speech" ? t.speech : t.size;
    const total = parseFloat(sizeText) * (sizeText.includes("GB") ? 1000 : 1);
    if (app.ui.pct == null) app.ui.pct = 0;
    every(300, () => {
      app.ui.pct = Math.min(100, app.ui.pct + (kind === "speech" ? 14 : 7));
      const done = Math.round((app.ui.pct / 100) * total);
      app.ui.progress = total >= 1000 ? `${(done / 1000).toFixed(1)} GB` : `${done} MB`;
      const label = frame.querySelector(kind === "speech" ? 'label[for="speech-dl"]' : 'label[for="model-dl"]');
      const bar = frame.querySelector(kind === "speech" ? "#speech-dl" : "#model-dl");
      if (label) label.textContent = `${kind === "speech" ? "Getting speech ready on this device" : "Downloading the assistant"}: ${app.ui.progress} of ${sizeText}`;
      if (bar) bar.value = app.ui.pct;
      if (app.ui.pct >= 100) {
        clearTimers();
        app.ui.download = null; app.ui.pct = null; app.ui.progress = null;
        if (kind === "speech") { app.s.speechReady = true; if (app.state === "fresh") { app.state = "default"; syncBar(); } beginRecording(app.ui.speechFor || "initiative"); return; }
        app.s.modelReady = true; app.s.ai = "device"; app.s.modelSkipped = false;
        if (app.screen === "step1-download") { app.screen = "step1"; app.state = "default"; syncBar(); }
        render();
        toast("The assistant now runs on this device");
      }
    });
  }

  function startBuilding() {
    if (app.ui.buildPct == null) app.ui.buildPct = 0;
    every(160, () => {
      app.ui.buildPct = Math.min(100, app.ui.buildPct + 9);
      const bar = frame.querySelector("#build-pg");
      if (bar) bar.value = app.ui.buildPct;
      if (app.ui.buildPct >= 100) { clearTimers(); app.ui.building = false; app.s.hasDraft = true; go("card", { ui: {} }); toast("Your card is ready to check"); }
    });
  }

  // What the person says next, in the walkthrough: the next answer in the script, or one more thing for needs and offers.
  const EXTRA_SAID = { initiative: "Since 2019. Forty families, and the school comes up every month.", need: "And volunteers for the planting days in November, maybe twenty people.", offer: "We could also teach other groups how we run the monthly work days." };
  function nextSaid(step) {
    const turns = app.s.convo[step];
    const script = D.convo[step];
    const next = script.slice(turns.length).find((t) => t.from === "person" && t.text);
    return next ? next.text : EXTRA_SAID[step];
  }
  function beginRecording(step) {
    app.ui.recording = true; app.ui.recStep = step; app.ui.seconds = 0; app.ui.clock = "0:00"; app.ui.live = ""; app.ui.listenDemo = false;
    render();
    const live = frame.querySelector("#live-words");
    if (live) live.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
  }
  function startRecordingClock() {
    const words = nextSaid(app.ui.recStep || "initiative").split(" ");
    if (app.ui.seconds == null) app.ui.seconds = 0;
    every(1000, () => {
      app.ui.seconds += 1;
      const m = Math.floor(app.ui.seconds / 60);
      const s = app.ui.seconds % 60;
      app.ui.clock = `${m}:${s < 10 ? "0" : ""}${s}`;
      const shown = Math.min(words.length, app.ui.seconds * 4);
      app.ui.live = words.slice(0, shown).join(" ");
      const status = frame.querySelector(".rcp-voice-status");
      const live = frame.querySelector("#live-words");
      if (status && status.childNodes[1]) status.childNodes[1].textContent = `Listening, ${app.ui.clock}`;
      if (live && live.firstChild) live.firstChild.textContent = app.ui.live;
      if (app.ui.recStep === "initiative") updatePreview(livePersonText() + " " + app.ui.live);
      if (shown >= words.length && !app.ui.listenDemo) act("rec-stop", app.ui.recStep);
    });
  }
  const livePersonText = () => app.s.convo.initiative.filter((t) => t.from === "person" && t.text).map((t) => t.text).join(" ");

  // The assistant answers each turn with one short line. For needs and offers it also makes a card from what was said.
  function addTurn(step, turn) {
    const s = app.s;
    s.convo[step] = s.convo[step].concat(turn);
    if (step === "initiative") s.hasDraft = s.hasDraft || false;
    app.ui.thinking = step;
    render();
    const log = frame.querySelector(".rcp-convo-log");
    if (log && log.lastElementChild) log.lastElementChild.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
    flowAfter(800, () => {
      app.ui.thinking = null;
      const script = D.convo[step];
      let reply;
      if (step === "initiative") {
        const next = script.slice(s.convo[step].length).find((t) => t.from === "assistant");
        reply = next && s.convo[step].length < script.length ? next.text : turn.attachments ? `Got it. I read ${turn.attachments[0].name} on this device. Build your card when you are ready.` : "Got it. Add more any time, or build your card.";
      } else {
        const text = turn.text || (turn.attachments ? turn.attachments.map((a) => a.name).join(" ") : "");
        const kind = step;
        const me = ctx().me;
        const active = (kind === "need" ? me.needs : me.offers).filter((i) => !s.removed[i.id]).length;
        if (active < D.limits[kind] && text) {
          const id = `${kind[0]}x${Date.now()}`;
          const title = text.replace(/^(and|also|we could also)\s+/i, "").replace(/[.,]?\s*maybe.*$/i, "");
          s.added[kind].push({ id, title: title.charAt(0).toUpperCase() + title.slice(1, 70), line: "", capitals: H.guessCapitals(text).slice(0, 3), kept: false, scope: "here", when: kind === "need" ? "" : undefined, capacity: kind === "offer" ? "" : undefined, terms: ["open"] });
          reply = active + 1 >= D.limits[kind] ? "That makes five. Keep the ones that matter most." : "Added a card. Anything else?";
        } else reply = active >= D.limits[kind] ? "You have five already. Remove one to add another." : "Got it.";
      }
      s.convo[step] = s.convo[step].concat({ from: "assistant", text: reply });
      render();
      if (step === "initiative") updatePreview(livePersonText());
    });
  }

  // ----- Toast -----
  let toastTimer = null;
  function toast(text) {
    toastLayer.innerHTML = `<p class="rcp-toast">${H.icon("done", "sm")}${H.esc(text)}</p>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      const el = toastLayer.firstElementChild;
      if (!el) return;
      el.setAttribute("data-leaving", "");
      setTimeout(() => { if (toastLayer.firstElementChild === el) toastLayer.innerHTML = ""; }, reduceMotion() ? 0 : 220);
    }, 3800);
  }

  // ----- Live preview beside the conversation -----
  function updatePreview(text) {
    const g = H.liveGuess(text);
    const card = frame.querySelector("#live-card");
    if (!card) return;
    const set = (sel, value) => { const el = frame.querySelector(sel); if (el && el.textContent !== value) { el.textContent = value; return true; } return false; };
    let changed = set("#pv-name", g.name || "Your initiative");
    changed = set("#pv-place", g.place || "Where you work") || changed;
    changed = set("#pv-since", g.since ? `Since ${g.since}` : "") || changed;
    const kinds = frame.querySelector("#pv-kinds");
    if (kinds) {
      const st = {};
      g.kinds.forEach((k) => (st[k] = "suggested"));
      const html = H.tileList(st, "Kinds of support heard so far", { tip: "Heard so far" });
      const key = g.kinds.join(",");
      if (kinds.dataset.kinds !== key) { kinds.innerHTML = html; kinds.dataset.kinds = key; wireTooltips(kinds); changed = true; }
    }
    set("#pv-note", g.words ? `${g.words} words so far. All of this is a guess until you check it.` : "Fills in as you talk. Nothing leaves this device.");
    if (changed) { card.removeAttribute("data-just-kept"); void card.offsetWidth; card.setAttribute("data-just-kept", ""); }
  }

  // ----- Tooltips and menus: native popovers, placed next to whatever opened them -----
  const nativeInterest = "interestForElement" in HTMLButtonElement.prototype;
  function sourceFor(pop) {
    const id = CSS.escape(pop.id);
    return document.querySelector(`[popovertarget="${id}"]`) || document.querySelector(`[interestfor="${id}"]`);
  }
  function place(pop) {
    const src = sourceFor(pop);
    if (!src) return;
    const r = src.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const fr = frame.getBoundingClientRect();
    const minX = Math.max(8, frameScrolls() ? fr.left + 8 : 8);
    const maxX = Math.min(vw - 8, frameScrolls() ? fr.right - 8 : vw - 8);
    pop.style.position = "fixed";
    pop.style.margin = "0";
    pop.style.maxInlineSize = `${Math.max(200, maxX - minX)}px`;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const isTip = pop.classList.contains("rcp-tooltip");
    let left = isTip ? r.left + r.width / 2 - w / 2 : r.left;
    left = Math.max(minX, Math.min(left, maxX - w));
    let top = isTip ? r.top - h - 8 : r.bottom + 6;
    if (isTip && top < 8) top = r.bottom + 8;
    if (!isTip && top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(Math.max(8, top))}px`;
  }
  document.addEventListener("toggle", (e) => {
    const pop = e.target;
    if (!(pop instanceof HTMLElement) || !pop.hasAttribute("popover")) return;
    if (e.newState === "open") { place(pop); return; }
    // A filter menu applies its choices when it closes.
    if (pop.classList.contains("rcp-menu") && pop.dataset.list && app.ui.menuDirty) { app.ui.menuDirty = false; render(); }
  }, true);
  window.addEventListener("scroll", () => document.querySelectorAll(".rcp-tooltip:popover-open").forEach((p) => p.hidePopover()), true);
  // Browsers without interestfor get the same behaviour from pointer and focus.
  function wireTooltips(root) {
    if (nativeInterest) return;
    root.querySelectorAll("[interestfor]").forEach((b) => b.setAttribute("aria-describedby", b.getAttribute("interestfor")));
  }
  if (!nativeInterest) {
    let showT = null;
    let hideT = null;
    const tipOf = (el) => { const b = el && el.closest && el.closest("[interestfor]"); return b ? document.getElementById(b.getAttribute("interestfor")) : null; };
    const show = (pop) => { clearTimeout(hideT); clearTimeout(showT); showT = setTimeout(() => { document.querySelectorAll(".rcp-tooltip:popover-open").forEach((p) => p !== pop && p.hidePopover()); try { if (!pop.matches(":popover-open")) pop.showPopover(); } catch (e) { /* removed */ } }, 250); };
    const hide = (pop) => { clearTimeout(showT); hideT = setTimeout(() => { try { if (pop.matches(":popover-open") && !pop.matches(":hover")) pop.hidePopover(); } catch (e) { /* removed */ } }, 150); };
    document.addEventListener("pointerover", (e) => { const pop = tipOf(e.target); if (pop && e.pointerType !== "touch") show(pop); });
    document.addEventListener("pointerout", (e) => { const pop = tipOf(e.target); if (pop) hide(pop); });
    document.addEventListener("focusin", (e) => { const pop = tipOf(e.target); if (pop) show(pop); });
    document.addEventListener("focusout", (e) => { const pop = tipOf(e.target); if (pop) hide(pop); });
  }

  // ----- Sheets and dialogs -----
  // One native dialog serves every sheet and pop-up. In the 360 px frame it sits over the frame; on a phone or a narrow window it is a sheet from the bottom; on a wide screen it is a dialog.
  let sheet = null;
  let dialogHandler = null;

  function dialogHTML(c, spec) {
    const st = spec.fromScreen ? app.state : "default";
    if (spec.kind === "signin") return H.signinSheet(c, spec, st);
    if (spec.kind === "share") return H.shareSheet(c, spec, st);
    if (spec.kind === "consent") return H.consentDialog(c, spec.fromScreen && app.state === "session");
    if (spec.kind === "intro") return H.introDialog(c, spec.ids.map((id) => D.partners.find((x) => x.id === id) || D.directory.find((x) => x.id === id)).filter(Boolean));
    if (spec.kind === "delete") return H.deleteDialog();
    if (spec.kind === "privacy") return H.privacyDialog(c, st);
    if (spec.kind === "ledger") return H.ledgerDialog(c, st);
    if (spec.kind === "describe") return `<div class="rc-dialog-body"><div class="rcp-sheet-grabber" aria-hidden="true" data-grabber></div><h2 id="proto-dialog-title" class="rc-dialog-title">Add your initiative first</h2><p>Introductions are between initiatives on the list. Tell us about yours, then share it.</p><div class="rc-action-bar">${H.btn({ label: "Describe your initiative", variant: "primary", go: "step1" })}${H.btn({ label: "Not now", variant: "quiet", act: "close-sheet" })}</div></div>`;
    return "";
  }
  function handlerFor(spec) {
    if (spec.kind === "consent") return onConsentClose;
    if (spec.kind === "intro") return (v) => onIntroClose(v, spec.ids);
    if (spec.kind === "delete") return onDeleteClose;
    return null;
  }

  function placeDialog() {
    const inFrame = app.width === "phone" && frameScrolls();
    const narrow = window.innerWidth < 640;
    dialog.dataset.presentation = inFrame || narrow ? "sheet" : "dialog";
    const props = ["--sheet-left", "--sheet-width", "--sheet-bottom", "--sheet-max", "--sheet-clip", "--sheet-end-radius"];
    if (!inFrame) { props.forEach((p) => dialog.style.removeProperty(p)); return; }
    let r = frame.getBoundingClientRect();
    if (r.bottom > window.innerHeight) { window.scrollBy(0, r.bottom - window.innerHeight + 8); r = frame.getBoundingClientRect(); }
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const bottom = Math.max(0, vh - r.bottom);
    dialog.style.setProperty("--sheet-left", `${r.left}px`);
    dialog.style.setProperty("--sheet-width", `${r.width}px`);
    dialog.style.setProperty("--sheet-bottom", `${bottom}px`);
    dialog.style.setProperty("--sheet-max", `${Math.round(Math.min(r.height, vh) * 0.9)}px`);
    dialog.style.setProperty("--sheet-clip", `inset(${Math.max(0, r.top)}px ${Math.max(0, vw - r.right)}px ${bottom}px ${Math.max(0, r.left)}px round 8px)`);
    dialog.style.setProperty("--sheet-end-radius", "var(--radius-lg)");
  }
  window.addEventListener("resize", () => { if (dialog.open) placeDialog(); Backdrop.resize(); });

  function focusInDialog() {
    const el = dialog.querySelector("[autofocus]") || dialog.querySelector("input:not([type=hidden]), textarea, select, button");
    if (el) el.focus();
  }
  function openSheet(spec, onClose) {
    sheet = spec;
    dialogHandler = onClose || null;
    dialog.innerHTML = dialogHTML(ctx(), spec);
    wireTooltips(dialog);
    dialog.removeAttribute("data-closing");
    dialog.style.removeProperty("translate");
    placeDialog();
    if (!dialog.open) dialog.showModal();
    focusInDialog();
    if (spec.kind === "signin" && spec.step === "code") { if (app.ui.resendIn == null) app.ui.resendIn = 60; startResend(); }
  }
  function swapSheet(spec, onClose) { sheet = spec; dialogHandler = onClose || null; refreshSheet(true); }
  function refreshSheet(moveFocus) {
    if (!dialog.open || !sheet) return;
    const focusId = !moveFocus && document.activeElement && dialog.contains(document.activeElement) ? document.activeElement.id : null;
    dialog.innerHTML = dialogHTML(ctx(), sheet);
    wireTooltips(dialog);
    placeDialog();
    const el = focusId && document.getElementById(focusId);
    if (el) el.focus(); else focusInDialog();
  }
  // Every close goes through here, so what happens next does not wait for the close event.
  let closeHandled = false;
  function afterClose(v) {
    dialog.removeAttribute("data-closing");
    const h = dialogHandler;
    const spec = sheet;
    dialogHandler = null;
    sheet = null;
    stopResend();
    if (v === "nav") return;
    if (h) h(v, spec);
    else if (spec && spec.fromScreen && v !== "flow") settleToBase();
  }
  function closeNow(value) {
    if (!dialog.open) return;
    closeHandled = true;
    dialog.close(value);
    afterClose(value);
  }
  function canAnimateExit() { return window.CSS && CSS.supports("overlay", "auto"); }
  function closeSheet(value) {
    if (!dialog.open) return;
    if (reduceMotion() || canAnimateExit()) { closeNow(value); return; }
    dialog.setAttribute("data-closing", "");
    const anims = dialog.getAnimations();
    Promise.race([Promise.allSettled(anims.map((a) => a.finished)), new Promise((r) => setTimeout(r, 360))]).then(() => { dialog.removeAttribute("data-closing"); closeNow(value); });
  }
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet("cancel"); });
  dialog.addEventListener("close", () => {
    const v = dialog.returnValue;
    dialog.returnValue = "";
    if (closeHandled) { closeHandled = false; return; }
    afterClose(v);
  });
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    dialog.addEventListener("click", (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
      if (!inside) closeSheet("no");
    });
  }
  // Drag the sheet down by its grabber to dismiss it.
  dialog.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-grabber]");
    if (!handle || dialog.dataset.presentation !== "sheet") return;
    const y0 = e.clientY;
    let dy = 0;
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => { dy = Math.max(0, ev.clientY - y0); dialog.style.translate = `0 ${dy}px`; };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      dialog.style.removeProperty("translate");
      if (dy > 80) closeSheet("no");
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });

  function onConsentClose(v) {
    if (v === "yes") {
      app.s.ai = "cloud";
      app.s.cloudConsent = app.ui.consentSession ? "session" : "once";
      D.ledger.push({ when: "4 November 2026, now", what: "Your initiative, step 1", where: "Cloud assistant, with your consent", words: 142, retention: "Not kept after the reply (Anthropic, zero data retention)" });
      if (app.screen === "step1-consent") { app.screen = "step1"; app.state = "default"; syncBar(); }
      render();
      toast("This step will run in the cloud once");
    } else {
      if (app.screen === "step1-consent") { app.screen = "step1"; app.state = "default"; syncBar(); }
      app.s.modelSkipped = true;
      if (app.s.ai === "cloud") app.s.ai = "keywords";
      render();
    }
  }
  function onIntroClose(v, ids) {
    if (app.screen === "partners-after" && app.state === "intro") { app.state = "default"; syncBar(); }
    if (v === "yes") { ids.forEach((id) => (app.s.intros[id] = true)); toast(ids.length === 1 ? "Request sent. We email you when they reply." : `${ids.length} requests sent. We email you as they reply.`); }
    render();
  }
  function onDeleteClose(v) {
    if (v === "yes") { clearFlow(); app.s = newSession(); app.history = []; go("home"); toast("Deleted. Nothing about you is kept."); return; }
    if (app.screen === "settings" && app.state === "deleting") { app.state = "default"; syncBar(); }
    render();
  }
  function openSignin(resume) { openSheet({ kind: "signin", step: "email", resume }, null); }
  function openIntro(ids) { openSheet({ kind: "intro", ids }, (v) => onIntroClose(v, ids)); }

  // ----- Actions -----
  function readForm(form) {
    const data = {};
    new FormData(form).forEach((v, k) => { if (data[k] === undefined) data[k] = v; else data[k] = [].concat(data[k], v); });
    return data;
  }
  const inSheet = (el) => !!(el && dialog.contains(el));
  const refreshFor = (el) => (inSheet(el) ? refreshSheet() : render());

  // After a code is confirmed: one door, then whatever the person was doing.
  function finishSave(resume) {
    const s = app.s;
    s.saved = true; s.hasDraft = true;
    stopResend();
    app.ui.resendIn = null; app.ui.shareStep = null;
    if (resume === "share" || resume.startsWith("intro:")) {
      s.visibility = "community";
      if (resume.startsWith("intro:")) {
        const id = resume.split(":")[1];
        render();
        if (dialog.open) swapSheet({ kind: "intro", ids: [id] }, (v) => onIntroClose(v, [id])); else openIntro([id]);
        toast("Saved and shared. Now add a line for them.");
        return;
      }
      closeSheet("flow");
      toast("Saved and shared. Your partners are open.");
      if (app.screen === "partners-before") go("partners-after"); else { if (["email", "code", "saved", "share"].includes(app.screen)) { app.screen = "finish"; app.state = "default"; syncBar(); } render(); }
      return;
    }
    if (resume === "save-private") { s.visibility = "private"; closeSheet("flow"); toast("Saved. Private: you see funding matches."); render(); return; }
    if (resume.startsWith("remind:")) {
      const id = resume.split(":")[1];
      s.reminders[id] = true;
      closeSheet("flow");
      render();
      toast("Saved. We will remind you a week before it closes.");
      return;
    }
    if (resume === "claim") { closeSheet("flow"); app.pendingFlash = { tone: "success", title: "Saved. Now confirm the imported record", body: "Imported details stay in pencil until you keep them." }; go("card"); return; }
    if (resume === "signin") { closeSheet("flow"); toast("Signed in. Welcome back."); go("finish"); return; }
    if (app.screen === "code" || app.screen === "email") { app.screen = "saved"; app.state = "default"; syncBar(); }
    render();
    if (dialog.open) swapSheet({ kind: "share", justSaved: true }); else openSheet({ kind: "share", justSaved: true }, null);
  }

  function shareForPartners(then) {
    const s = app.s;
    if (!s.hasDraft) { openSheet({ kind: "describe" }, null); return; }
    if (!s.saved) { openSignin(then || "share"); return; }
    openSheet({ kind: "share", preset: "community", then }, null);
  }

  function act(name, arg, el, submitter) {
    const s = app.s;
    const ui = app.ui;
    switch (name) {
      case "back": { const prev = app.history.pop() || "home"; app.history.pop(); go(prev); return; }
      case "retry": { app.state = "default"; syncBar(); render(); return; }
      case "draft": s.hasDraft = true; go("card"); return;
      case "ai-off": s.ai = "none"; render(); return;
      case "ai-on": s.ai = s.modelReady ? "device" : "keywords"; if (app.state === "noai") { app.state = "default"; syncBar(); } render(); return;
      case "model-download": ui.download = "running"; ui.pct = ui.pct || 0; if (app.screen === "step1-download") { app.state = "running"; syncBar(); } render(); return;
      case "model-builtin": s.modelReady = true; s.modelBuiltIn = true; s.ai = "device"; s.modelSkipped = false; if (app.screen === "step1-download") { app.screen = "step1"; app.state = "default"; syncBar(); } render(); toast("Using this browser’s own assistant"); return;
      case "model-cancel": ui.download = null; ui.pct = null; if (app.screen === "step1-download") { app.state = "default"; syncBar(); } render(); return;
      case "model-skip": s.modelSkipped = true; s.ai = "keywords"; if (app.screen === "step1-download") { app.screen = "step1"; app.state = "default"; syncBar(); } render(); return;
      case "model-remove": { const builtIn = s.modelBuiltIn; s.modelReady = false; s.modelBuiltIn = false; s.ai = "keywords"; render(); toast(builtIn ? "Stopped using this browser’s assistant" : "Removed the assistant from this device"); return; }
      case "open-consent": openSheet({ kind: "consent" }, onConsentClose); return;
      case "rec-start": {
        const step = arg || "initiative";
        if (!s.speechReady && tier().speech !== "0 MB") { ui.download = "speech"; ui.speechFor = step; ui.pct = 0; render(); return; }
        if (app.state === "error" || app.state === "listening") { app.state = "default"; syncBar(); }
        beginRecording(step); return;
      }
      case "rec-stop": {
        clearTimers();
        const step = arg || ui.recStep || "initiative";
        const text = (ui.live || nextSaid(step)).trim();
        ui.recording = false; ui.live = ""; ui.listenDemo = false;
        if (app.state === "listening") { app.state = "default"; syncBar(); }
        addTurn(step, { from: "person", via: "voice", text });
        return;
      }
      case "type-turn": {
        const data = readForm(el);
        const text = (data.text || "").trim();
        if (!text) { const ta = el.querySelector("textarea"); if (ta) ta.focus(); return; }
        addTurn(arg, { from: "person", via: "typed", text });
        return;
      }
      case "attach-link": {
        const data = readForm(el);
        const url = (data.link || "").trim().replace(/^https?:\/\//, "");
        if (!url) { const f = el.querySelector("input"); if (f) f.focus(); return; }
        const pop = el.closest("[popover]"); if (pop) pop.hidePopover();
        addTurn(arg, { from: "person", via: "attach", attachments: [{ kind: "link", name: url, note: "Preview fetched" }] });
        return;
      }
      case "file-pick": { const input = frame.querySelector(`#file-${arg}`); if (input) input.click(); return; }
      case "edit-turn": ui.editingTurn = arg; render(); { const f = frame.querySelector(`#turn-${arg.replace(":", "-")}`); if (f) f.focus(); } return;
      case "cancel-turn": ui.editingTurn = null; render(); return;
      case "save-turn": { const [step, i] = arg.split(":"); const data = readForm(el); const turns = s.convo[step].slice(); turns[Number(i)] = Object.assign({}, turns[Number(i)], { text: (data.text || "").trim() || turns[Number(i)].text }); s.convo[step] = turns; ui.editingTurn = null; render(); toast("Changed. The card uses your new words."); return; }
      case "build-card": ui.building = true; ui.buildPct = 0; render(); return;
      case "keep": s.kept[arg] = true; ui.justKept = arg; render(); flowAfter(400, () => { ui.justKept = null; }); return;
      case "remove": s.removed[arg] = true; ui.editing = null; render(); return;
      case "undo-remove": delete s.removed[arg]; render(); return;
      case "edit": ui.editing = arg; render(); return;
      case "cancel-edit": { const blank = s.added.need.concat(s.added.offer).find((i) => i.id === ui.editing && !i.title); if (blank) s.removed[blank.id] = true; ui.editing = null; if (app.state === "editing") { app.state = "default"; syncBar(); } render(); return; }
      case "add-blank": { const kind = arg; const id = `${kind[0]}b${Date.now()}`; s.added[kind].push({ id, title: "", line: "", capitals: [], kept: false, scope: "here", terms: [] }); ui.editing = id; render(); const f = frame.querySelector(`#${id}-title`); if (f) f.focus(); return; }
      case "save-card": {
        const data = readForm(el);
        const id = arg;
        const caps = [].concat(data[`${id}-cap`] || []);
        s.titles[id] = { title: data[`${id}-title`] || undefined, line: data[`${id}-line`], capitals: caps.length ? caps : undefined, amount: data[`${id}-amount`], when: data[`${id}-when`], capacity: data[`${id}-capacity`], scope: data[`${id}-scope`], terms: [].concat(data[`${id}-terms`] || []) };
        Object.keys(s.titles[id]).forEach((k) => s.titles[id][k] === undefined && delete s.titles[id][k]);
        const added = s.added.need.concat(s.added.offer).find((i) => i.id === id);
        if (added) Object.assign(added, s.titles[id], { capitals: caps.length ? caps : added.capitals.length ? added.capitals : ["social"] });
        s.kept[id] = true; ui.editing = null; ui.justKept = id;
        if (app.state === "editing") { app.state = "default"; syncBar(); }
        render(); flowAfter(400, () => { ui.justKept = null; }); return;
      }
      case "keep-derived": s.derivedKept[arg] = true; ui.justKept = arg; render(); flowAfter(400, () => { ui.justKept = null; }); return;
      case "keep-all-derived": ["stage", "lenses", "themes", "places", "languages", "beneficiaries"].forEach((k) => (s.derivedKept[k] = true)); render(); return;
      case "remove-derived": s.removedDerived[arg] = true; render(); return;
      case "undo-derived": delete s.removedDerived[arg]; render(); return;
      case "correct": ui.correcting = arg; render(); return;
      case "cancel-correct": ui.correcting = null; if (app.state === "correcting") { app.state = "default"; syncBar(); } render(); return;
      case "save-correction": {
        const data = readForm(el);
        if (arg === "stage" && data.stage) s.overrides.stage = data.stage;
        if (arg === "lenses") s.overrides.lenses = [].concat(data.lens || []);
        if (arg === "beneficiaries" && data["edit-beneficiaries"]) s.overrides.beneficiaries = data["edit-beneficiaries"];
        s.derivedKept[arg] = true; ui.correcting = null;
        if (app.state === "correcting") { app.state = "default"; syncBar(); }
        render(); return;
      }
      case "remove-location": case "remove-link": case "remove-themes": case "remove-languages": case "remove-place": {
        const key = name.replace("remove-", "");
        (s.removedValues[key] = s.removedValues[key] || []).push(arg); render(); return;
      }
      case "save-fields": render(); return;
      case "not-now": s.notNow[arg] = true; render(); return;
      case "open-signin": openSignin(arg || (s.hasDraft ? "save" : "signin")); return;
      case "open-share": openSheet({ kind: "share", preset: arg || undefined }, null); return;
      case "open-delete": openSheet({ kind: "delete" }, onDeleteClose); return;
      case "open-privacy": openSheet({ kind: "privacy" }, null); return;
      case "open-ledger": openSheet({ kind: "ledger" }, null); return;
      case "share-for-partners": shareForPartners(); return;
      case "close-sheet": closeSheet("no"); return;
      case "send-code": {
        const data = readForm(el);
        const email = (data.email || "").trim();
        const fromShareCard = arg === "share" && !inSheet(el);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { ui.emailError = "That email looks incomplete. Check the part after the @."; refreshFor(el); return; }
        if (fromShareCard) ui.shareIntent = submitter && submitter.value === "private" ? "private" : "share";
        ui.emailError = null; s.email = email; ui.sending = true; refreshFor(el);
        flowAfter(900, () => {
          ui.sending = false; ui.resendIn = 60; ui.codeError = null; ui.codeValue = "";
          if (!fromShareCard && sheet && dialog.open) {
            sheet.step = "code"; sheet.fromScreen = false;
            if (app.screen === "email") { app.screen = "code"; app.state = "default"; syncBar(); }
            refreshSheet(true); startResend();
          } else {
            ui.shareStep = "code"; render(); startResend();
            const code = frame.querySelector("#code"); if (code) code.focus();
          }
        });
        return;
      }
      case "wrong-email": if (sheet && sheet.kind === "signin" && inSheet(el)) { sheet.step = "email"; sheet.fromScreen = false; stopResend(); refreshSheet(true); } else { ui.shareStep = null; stopResend(); render(); const f = frame.querySelector("#share-email"); if (f) f.focus(); } return;
      case "resend": ui.resendIn = 60; ui.codeError = null; startResend(); refreshFor(el); toast("We sent a new code. The old one no longer works."); return;
      case "check-code": {
        const data = readForm(el);
        const code = (data.code || "").replace(/\s+/g, "");
        const sheetFlow = inSheet(el);
        if (code.length < 6) { ui.codeValue = data.code; ui.codeError = "That code does not match. Check it, or send a new one."; refreshFor(el); return; }
        const wasKnown = sheetFlow && sheet && sheet.fromScreen && app.state === "known";
        ui.checking = true; ui.codeValue = data.code; refreshFor(el);
        flowAfter(900, () => {
          ui.checking = false; ui.codeError = null; ui.codeValue = "";
          if (wasKnown) { app.s.saved = true; closeSheet("flow"); go("merge"); return; }
          if (!sheetFlow) { finishSave(ui.shareIntent === "private" ? "save-private" : "share"); return; }
          finishSave((sheet && sheet.resume) || "save");
        });
        return;
      }
      case "share-save": {
        const data = readForm(el);
        const then = sheet && sheet.then;
        s.visibility = data.visibility === "community" ? "community" : "private";
        ui.pendingVisibility = null;
        const from = app.screen;
        if (then && s.visibility === "community" && then.startsWith("intro:")) { const id = then.split(":")[1]; render(); swapSheet({ kind: "intro", ids: [id] }, (v) => onIntroClose(v, [id])); toast("Shared with the community"); return; }
        closeSheet("flow");
        toast(s.visibility === "community" ? "Shared with the community. Your partners are open." : "Private. You see funding matches only.");
        if (from === "saved" || from === "share") { app.screen = "finish"; app.state = "default"; syncBar(); render(); }
        else if (from === "partners-before" && s.visibility === "community") go("partners-after");
        else if (from === "partners-after" && s.visibility === "private") go("partners-before");
        else render();
        return;
      }
      case "merge": toast("Done. Both versions are kept."); go("finish"); return;
      case "intro": {
        if (H.canSeePartners(s)) { openIntro([arg]); return; }
        if (!s.hasDraft) { openSheet({ kind: "describe" }, null); return; }
        if (!s.saved) { openSignin("intro:" + arg); return; }
        openSheet({ kind: "share", preset: "community", then: "intro:" + arg }, null); return;
      }
      case "team-intro": {
        const f = D.opportunities.find((x) => x.id === arg);
        const pick = (ui.team && ui.team[arg]) || (f.asks || []).map((a) => (a.candidates[0] || {}).id).filter(Boolean);
        const ids = pick.filter((id) => !s.intros[id]);
        if (ids.length) openIntro(ids);
        return;
      }
      case "dismiss": ui.dismissing = arg; render(); return;
      case "cancel-dismiss": ui.dismissing = null; if (app.state === "dismissing") { app.state = "default"; syncBar(); } render(); return;
      case "dismiss-reason": { const [id, reason] = arg.split("|"); s.dismissed[id] = reason; ui.dismissing = null; if (app.state === "dismissing") { app.state = "default"; syncBar(); } render(); toast(`Hidden. ${reason}.`); return; }
      case "undo-dismiss": delete s.dismissed[arg]; render(); return;
      case "remind": {
        if (!s.saved) { openSignin("remind:" + arg); return; }
        s.reminders[arg] = true; render(); toast("Reminder on. We email you a week before it closes."); return;
      }
      case "filter-search": { const data = readForm(el); const prev = (ui.filters && ui.filters[arg]) || {}; ui.filters = Object.assign({}, ui.filters, { [arg]: Object.assign({}, prev, { q: (data.q || "").trim() }) }); if (app.state === "filtered" || app.state === "empty") { app.state = "default"; syncBar(); } render(); return; }
      case "filter-clear": { const [list, fname] = arg.split(":"); const prev = Object.assign({}, (ui.filters && ui.filters[list]) || {}); delete prev[fname]; if (fname === "kinds") delete prev.kindIn; ui.filters = Object.assign({}, ui.filters, { [list]: prev }); ui.menuDirty = false; render(); return; }
      case "filter-remove": {
        const [list, fname, value] = arg.split(":");
        const prev = Object.assign({}, (ui.filters && ui.filters[list]) || {});
        if (Array.isArray(prev[fname])) prev[fname] = prev[fname].filter((v) => v !== value); else delete prev[fname];
        ui.filters = Object.assign({}, ui.filters, { [list]: prev });
        if (app.state === "filtered" || app.state === "empty") { app.state = "default"; syncBar(); }
        render(); return;
      }
      case "clear-filters": ui.filters = Object.assign({}, ui.filters, { [arg]: {} }); if (app.state === "empty" || app.state === "filtered") { app.state = "default"; syncBar(); } render(); return;
      case "copy-card": {
        const me = ctx().me;
        const text = `${me.name}\n${me.locations.join("; ")}\n\n${me.description}\n\nLinks: ${me.links.join(", ")}\n\nNeeds: ${me.needs.map((n) => n.title).join("; ")}\nOffers: ${me.offers.map((n) => n.title).join("; ")}`;
        const done = () => toast("Copied your card as plain text");
        try { navigator.clipboard.writeText(text).then(done, done); } catch (e) { done(); }
        return;
      }
      case "claim": openSignin("claim"); return;
      case "export": toast("In the app this downloads your data. The prototype stores nothing."); return;
      case "export-ledger": toast("In the app this downloads the record as a file."); return;
      case "withdraw-consent": s.cloudConsent = "withdrawn"; s.ai = s.modelReady ? "device" : "keywords"; refreshSheet(); toast("Cloud consent withdrawn"); return;
      case "sign-out": s.saved = false; render(); toast("Signed out of this device. Your draft stays here."); return;
      case "theme": { const v = el && el.value ? el.value : arg; applyTheme(v); return; }
      default: return;
    }
  }

  // ----- Events inside the frame and the dialog -----
  function onClick(root, e) {
    const goEl = e.target.closest("[data-go]");
    if (goEl && root.contains(goEl)) {
      e.preventDefault();
      const id = goEl.dataset.go;
      const arg = goEl.dataset.arg;
      const ui = {};
      if (id === "opportunity" && arg) ui.opportunity = arg;
      if (id === "initiative" && arg) ui.initiative = arg;
      go(id, { ui });
      return;
    }
    const actEl = e.target.closest("[data-act]");
    if (actEl && root.contains(actEl)) {
      e.preventDefault();
      act(actEl.dataset.act, actEl.dataset.arg, actEl);
    }
  }
  frame.addEventListener("click", (e) => onClick(frame, e));
  dialog.addEventListener("click", (e) => onClick(dialog, e));
  frame.addEventListener("submit", (e) => {
    const form = e.target.closest("form");
    e.preventDefault();
    if (form && form.dataset.actSubmit) act(form.dataset.actSubmit, form.dataset.arg, form, e.submitter);
  });
  dialog.addEventListener("submit", (e) => {
    const form = e.target.closest("form");
    e.preventDefault();
    if (form && form.dataset.actSubmit) { act(form.dataset.actSubmit, form.dataset.arg, form, e.submitter); return; }
    const session = dialog.querySelector('input[name="session"]');
    app.ui.consentSession = !!(session && session.checked);
    const note = dialog.querySelector("#intro-note");
    app.ui.introNote = note ? note.value : "";
    closeSheet(e.submitter && e.submitter.value === "no" ? "no" : e.submitter && e.submitter.value ? e.submitter.value : "yes");
  });
  dialog.addEventListener("change", (e) => {
    if (e.target.name === "visibility") { app.ui.pendingVisibility = e.target.value; refreshSheet(); }
  });
  frame.addEventListener("keydown", (e) => {
    // Enter sends a typed answer; Shift and Enter make a new line.
    if (e.key === "Enter" && !e.shiftKey && e.target.matches && e.target.matches(".rcp-typebar textarea")) { e.preventDefault(); e.target.form.requestSubmit(); }
  });
  frame.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches && t.matches('input[type="file"][data-step]')) {
      const f = t.files && t.files[0];
      if (f) { const pop = t.closest("[popover]"); if (pop) pop.hidePopover(); addTurn(t.dataset.step, { from: "person", via: "attach", attachments: [{ kind: "file", name: f.name, size: `${(f.size / 1048576).toFixed(1)} MB`, note: "Read on this device, not uploaded" }] }); }
      return;
    }
    // Filter menus: choices are kept as they are made and applied when the menu closes.
    if (t.matches && t.matches(".rcp-menu input[data-list]")) {
      const list = t.dataset.list;
      const menu = t.closest(".rcp-menu");
      const prev = Object.assign({}, (app.ui.filters && app.ui.filters[list]) || {});
      if (t.type === "radio") prev[t.name] = t.value;
      else prev[t.name] = [...menu.querySelectorAll(`input[name="${CSS.escape(t.name)}"]:checked`)].map((x) => x.value);
      app.ui.filters = Object.assign({}, app.ui.filters, { [list]: prev });
      app.ui.menuDirty = true;
      return;
    }
    if (t.matches && t.matches('input[name="team"][data-fund]')) {
      const fid = t.dataset.fund;
      app.ui.team = Object.assign({}, app.ui.team, { [fid]: [...frame.querySelectorAll(`input[name="team"][data-fund="${fid}"]:checked`)].map((x) => x.value) });
      render();
      return;
    }
    if (t.closest && t.closest('[data-act-change="visibility"]')) { app.s.visibility = t.value; render(); toast(t.value === "community" ? "Shared with the community. Your partners are open." : "Private. You see funding matches only."); return; }
    if (t.closest && t.closest('[data-act-change="notify"]')) { app.s.notify = Object.assign({}, app.s.notify, { [t.name]: t.checked }); toast(t.checked ? "We will email you about this" : "No more emails about this"); return; }
    const themeSet = t.closest && t.closest('[data-act-change="theme"]');
    if (themeSet) { act("theme", t.value, t); return; }
  });

  // ----- The backdrop: woven threads behind the whole home page, following the pointer -----
  // A variant of the website's mycelium canvas. Threads run along the warp and the weft in the eight colours of support, turn at right angles and fade. When the pointer rests, or on a touch screen, threads start on their own. Under reduced motion it draws one faint, still weave.
  const Backdrop = (() => {
    let canvas = null, g = null, host = null, raf = 0;
    let W = 0, Hh = 0, nodes = [], colors = [], lastSpawn = { x: -999, y: -999 }, lastMove = 0, idleAt = 0;
    const KEYS = ["living", "material", "intellectual", "experiential", "social", "financial", "cultural", "spiritual"];
    function readColors() {
      if (!host) return;
      const cs = getComputedStyle(host);
      colors = KEYS.map((k) => cs.getPropertyValue(`--on-capital-${k}`).trim()).filter(Boolean);
      if (!colors.length) colors = [cs.color];
    }
    function size() {
      if (!canvas) return;
      const wrap = canvas.parentElement;
      const hgt = frameScrolls() ? frame.clientHeight : window.innerHeight;
      wrap.style.setProperty("--backdrop-h", `${hgt}px`);
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; Hh = hgt;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(Hh * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function thread(x, y, dir, color, gen) {
      return { x, y, dir, color, gen, len: 0, max: (50 + Math.random() * 90) / (1 + gen * 0.5), phase: Math.random() * 6, amp: 2 + Math.random() * 3, speed: 0.9 + Math.random() * 0.8, alive: true };
    }
    function spawn(x, y) {
      if (nodes.length > 28) nodes.shift();
      const color = colors[(Math.random() * colors.length) | 0];
      const base = ((Math.random() * 4) | 0) * (Math.PI / 2);
      const n = 2 + (Math.random() < 0.35 ? 1 : 0);
      const threads = [];
      for (let i = 0; i < n; i++) threads.push(thread(x, y, base + i * (Math.PI / 2) * (i % 2 ? 1 : -1), color, 0));
      nodes.push({ threads, alpha: 0.42 });
    }
    function step() {
      raf = requestAnimationFrame(step);
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = "rgba(0, 0, 0, 0.045)";
      g.fillRect(0, 0, W, Hh);
      g.globalCompositeOperation = "source-over";
      const now = performance.now();
      if (now - lastMove > 1600 && now > idleAt) {
        idleAt = now + 700;
        const edge = Math.random() < 0.5;
        spawn(edge ? (Math.random() < 0.5 ? W * 0.06 : W * 0.94) : Math.random() * W, edge ? Math.random() * Hh : Math.random() < 0.5 ? Hh * 0.08 : Hh * 0.92);
      }
      for (let n = nodes.length - 1; n >= 0; n--) {
        const node = nodes[n];
        node.alpha -= 0.0016;
        if (node.alpha <= 0) { nodes.splice(n, 1); continue; }
        const born = [];
        node.threads.forEach((t) => {
          if (!t.alive) return;
          const px = t.x + Math.cos(t.dir) * t.speed;
          const py = t.y + Math.sin(t.dir) * t.speed;
          t.phase += 0.16;
          const off = Math.sin(t.phase) * t.amp - Math.sin(t.phase - 0.16) * t.amp;
          const nx = px - Math.sin(t.dir) * off;
          const ny = py + Math.cos(t.dir) * off;
          g.strokeStyle = t.color;
          g.globalAlpha = Math.max(0, node.alpha * (1 - t.gen * 0.25));
          g.lineWidth = Math.max(0.6, 1.4 - t.gen * 0.35);
          g.lineCap = "round";
          g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(nx, ny); g.stroke();
          t.x = nx; t.y = ny; t.len += 1;
          if (Math.random() < 0.012 && t.gen < 2) {
            g.beginPath(); g.arc(t.x, t.y, 1.6, 0, Math.PI * 2); g.fillStyle = t.color; g.fill();
            born.push(thread(t.x, t.y, t.dir + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2), t.color, t.gen + 1));
          }
          if (t.len > t.max || t.x < -10 || t.x > W + 10 || t.y < -10 || t.y > Hh + 10) t.alive = false;
        });
        node.threads.push(...born);
        g.globalAlpha = 1;
      }
    }
    function still() {
      g.clearRect(0, 0, W, Hh);
      const rows = 9, cols = 13;
      for (let i = 0; i < rows + cols; i++) {
        const horizontal = i < rows;
        g.strokeStyle = colors[i % colors.length];
        g.globalAlpha = 0.14;
        g.lineWidth = 1;
        g.beginPath();
        for (let k = 0; k <= 60; k++) {
          const u = k / 60;
          const wave = Math.sin(u * Math.PI * 8 + i) * 3;
          const x = horizontal ? u * W : ((i - rows + 0.5) / cols) * W + wave;
          const y = horizontal ? ((i + 0.5) / rows) * Hh + wave : u * Hh;
          if (k) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      lastMove = performance.now();
      if (x < 0 || y < 0 || x > W || y > Hh) return;
      if ((x - lastSpawn.x) ** 2 + (y - lastSpawn.y) ** 2 < 44 * 44) return;
      lastSpawn = { x, y };
      spawn(x, y);
    }
    function start() { if (!raf && !document.hidden && !reduceMotion()) step(); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function unmount() { stop(); if (host) host.removeEventListener("pointermove", onMove); canvas = g = host = null; nodes = []; }
    document.addEventListener("visibilitychange", () => { if (!canvas) return; if (document.hidden) stop(); else start(); });
    return {
      mount(el) {
        if (el === canvas) return;
        unmount();
        if (!el) return;
        canvas = el; g = canvas.getContext("2d"); host = canvas.closest(".rcp-home");
        readColors(); size();
        if (reduceMotion()) { still(); return; }
        host.addEventListener("pointermove", onMove);
        for (let i = 0; i < 5; i++) spawn(Math.random() * W, Math.random() * Hh);
        start();
      },
      resize() { if (!canvas) return; size(); g.clearRect(0, 0, W, Hh); if (reduceMotion()) still(); },
      refresh() { if (!canvas) return; readColors(); size(); g.clearRect(0, 0, W, Hh); nodes = []; if (reduceMotion()) still(); },
    };
  })();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => Backdrop.refresh());

  // ----- Control bar -----
  function buildScreenSelect() {
    screenSelect.innerHTML = GROUPS.map((g) => `<optgroup label="${g}">${ORDER.filter((id) => S[id].group === g).map((id) => `<option value="${id}">${S[id].title}</option>`).join("")}</optgroup>`).join("");
  }
  function syncBar() {
    screenSelect.value = app.screen;
    const def = S[app.screen];
    stateSelect.innerHTML = Object.keys(def.states).map((k) => `<option value="${k}">${def.states[k]}</option>`).join("");
    stateSelect.value = app.state;
    document.querySelectorAll("[data-theme-choice]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeChoice === app.theme ? "true" : "false"));
    document.querySelectorAll("[data-width-choice]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.widthChoice === app.width ? "true" : "false"));
    const i = ORDER.indexOf(app.screen);
    $("#proto-prev").disabled = i <= 0;
    $("#proto-next").disabled = i >= ORDER.length - 1;
    frameLabel.textContent = `${def.title} · ${def.states[app.state]} · ${app.width === "phone" ? "360 px" : "full width"}`;
  }
  screenSelect.addEventListener("change", () => go(screenSelect.value, { fromList: true }));
  stateSelect.addEventListener("change", () => { app.state = stateSelect.value; const keep = { opportunity: app.ui.opportunity, initiative: app.ui.initiative }; app.ui = keep; stopResend(); const def = S[app.screen]; if (def.preset) def.preset(app.s, true, app.state); syncBar(); render({ scrollTop: true, syncDialog: true }); });
  $("#proto-prev").addEventListener("click", () => { const i = ORDER.indexOf(app.screen); if (i > 0) go(ORDER[i - 1], { fromList: true }); });
  $("#proto-next").addEventListener("click", () => { const i = ORDER.indexOf(app.screen); if (i < ORDER.length - 1) go(ORDER[i + 1], { fromList: true }); });
  document.querySelectorAll("[data-theme-choice]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.themeChoice)));
  document.querySelectorAll("[data-width-choice]").forEach((b) => b.addEventListener("click", () => applyWidth(b.dataset.widthChoice)));
  $("#proto-reset").addEventListener("click", () => { clearFlow(); app.s = newSession(); app.history = []; app.ui = {}; go("home", { fromList: true }); });
  const notesToggle = $("#proto-notes-toggle");
  const notes = $("#proto-notes");
  notesToggle.addEventListener("click", () => {
    const open = notes.hidden;
    notes.hidden = !open;
    notesToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) notes.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  });
  notes.addEventListener("click", (e) => {
    const b = e.target.closest("[data-notes-tab]");
    if (!b) return;
    notes.querySelectorAll("[data-notes-tab]").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    notes.querySelectorAll(".proto-notes-section").forEach((sec) => (sec.hidden = sec.id !== b.dataset.notesTab));
  });

  // ----- Theme and width -----
  function applyTheme(v) {
    app.theme = v;
    const root = document.documentElement;
    if (v === "light" || v === "dark") root.dataset.theme = v;
    else delete root.dataset.theme;
    try { if (v === "system") localStorage.removeItem("proto-theme"); else localStorage.setItem("proto-theme", v); } catch (e) { /* storage may be blocked */ }
    syncBar();
    if (app.screen === "settings") render();
    Backdrop.refresh();
  }
  new MutationObserver(() => {
    const root = document.documentElement;
    if (app.theme !== "system" && root.dataset.theme !== app.theme) root.dataset.theme = app.theme;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  function applyWidth(v) {
    app.width = v;
    stage.dataset.width = v;
    frame.dataset.width = v;
    try { localStorage.setItem("proto-width", v); } catch (e) { /* storage may be blocked */ }
    syncBar();
    render();
    if (dialog.open) placeDialog();
  }

  // ----- Start -----
  buildScreenSelect();
  let storedTheme = null;
  let storedWidth = null;
  try { storedTheme = localStorage.getItem("proto-theme"); storedWidth = localStorage.getItem("proto-width"); } catch (e) { /* storage may be blocked */ }
  if (storedTheme === "light" || storedTheme === "dark") applyTheme(storedTheme);
  if (storedWidth === "desktop") { app.width = "desktop"; stage.dataset.width = "desktop"; frame.dataset.width = "desktop"; }
  // Photographs show once they are published beside the page; until then the drawn scenes stand in.
  const probe = new Image();
  probe.onload = () => { H.photosReady = true; if (app.ready) render(); };
  probe.src = D.photos.springs.file;
  const start = () => {
    const hash = (location.hash || "").slice(1);
    go(S[hash] ? hash : "home", { fromList: true });
    app.ready = true;
  };
  const fontsReady = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('1rem "Space Grotesk"'), document.fonts.load('1rem "Fraunces"'), document.fonts.load('1rem "Source Serif 4"')]) : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(start, start);
  window.addEventListener("hashchange", () => { const id = (location.hash || "").slice(1); if (S[id] && id !== app.screen) go(id, { fromList: true }); });
})();

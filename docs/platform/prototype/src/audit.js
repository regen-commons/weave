// Prototype audit, not published. Renders every screen in every state through the control bar and checks the product markup.
window.__errs = window.__errs || [];
window.addEventListener("error", (e) => window.__errs.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => window.__errs.push(String(e.reason)));
const sleep = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const alpha = (c) => { const m = c.match(/[\d.]+/g); return m && m.length > 3 ? Number(m[3]) : 1; };
function bgOf(el) { let e = el; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); const bg = cs.backgroundColor; if (bg && alpha(bg) > 0.9 && cs.backgroundImage === "none") return bg; e = e.parentElement || (e.getRootNode && e.getRootNode().host); } return getComputedStyle(document.body).backgroundColor; }
function name(el) { return (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || (el.querySelector && el.querySelector("[aria-label]") ? "x" : "") || "").trim(); }
function visible(el) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; }
function checkRoots(label) {
  const out = [];
  const frame = document.querySelector("#proto-frame");
  const dialog = document.querySelector("#proto-dialog");
  const roots = [frame].concat(dialog.open ? [dialog] : []);
  const fr = frame.getBoundingClientRect();
  if (frame.scrollWidth > frame.clientWidth + 1) out.push(`${label}: frame scrolls sideways (${frame.scrollWidth} > ${frame.clientWidth})`);
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) out.push(`${label}: page scrolls sideways (${document.documentElement.scrollWidth})`);
  const h1s = frame.querySelectorAll("h1");
  if (h1s.length !== 1) out.push(`${label}: ${h1s.length} h1`);
  const ids = {};
  document.querySelectorAll("[id]").forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
  Object.keys(ids).filter((k) => ids[k] > 1).forEach((k) => out.push(`${label}: duplicate id ${k}`));
  roots.forEach((root) => {
    root.querySelectorAll("input, select, textarea").forEach((f) => {
      if (f.type === "hidden" || f.classList.contains("rcp-file-input") && false) return;
      const labelled = (f.id && document.querySelector(`label[for="${f.id}"]`)) || f.closest("label") || f.getAttribute("aria-label") || f.getAttribute("aria-labelledby");
      if (!labelled) out.push(`${label}: unlabelled ${f.tagName.toLowerCase()} ${f.name || f.id}`);
    });
    root.querySelectorAll("button, a[href]").forEach((b) => { if (!name(b)) out.push(`${label}: nameless ${b.tagName.toLowerCase()} ${b.className}`); });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (!t.textContent.trim()) continue;
      const el = t.parentElement;
      if (!el || seen.has(el) || !visible(el) || el.closest(".rc-visually-hidden, [aria-hidden=true], svg, option, .rc-skip-link")) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      if (size < 11.9) out.push(`${label}: ${size}px text "${t.textContent.trim().slice(0, 30)}"`);
      const fg = cs.color; const bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg);
      if (L1 == null || L2 == null || alpha(fg) < 0.99) continue;
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5) - 0.01) out.push(`${label}: contrast ${ratio.toFixed(2)} "${t.textContent.trim().slice(0, 30)}" ${fg} on ${bg}`);
    }
    root.querySelectorAll("button, a.rc-button, .rc-chip, input:not([type=hidden]):not(.rcp-file-input), select, textarea, [role=switch], .rc-tabs > a, .rc-bottom-nav > a, .rc-app-nav > a").forEach((b) => {
      if (!visible(b) || b.closest("[aria-hidden=true]") || b.classList.contains("rc-chip-remove") || b.closest(".rc-chip") && b.matches("input")) return;
      if (b.matches("input[type=checkbox], input[type=radio]") && b.closest("label")) return;
      const r = { width: b.offsetWidth, height: b.offsetHeight };
      if (r.height < 43.5 || r.width < 43.5) out.push(`${label}: target ${Math.round(r.width)}x${Math.round(r.height)} ${b.tagName.toLowerCase()} "${name(b).slice(0, 24)}"`);
    });
    root.querySelectorAll("*").forEach((e) => {
      if (root !== frame || !visible(e) || e.closest(".rcp-chip-scroll, .rc-table-scroll, .rcp-hero-canvas")) return;
      const r = e.getBoundingClientRect();
      if (r.right > fr.right + 1.5 && getComputedStyle(e).position !== "fixed") out.push(`${label}: ${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} pokes out by ${Math.round(r.right - fr.right)}px`);
    });
  });
  return out;
}
window.__audit = async (opts = {}) => {
  const sel = document.querySelector("#proto-screen");
  const stateSel = document.querySelector("#proto-state");
  const vt = document.startViewTransition;
  document.startViewTransition = undefined;
  const results = [];
  let renders = 0;
  const screens = opts.only || [...sel.options].map((o) => o.value);
  for (const id of screens) {
    sel.value = id; sel.dispatchEvent(new Event("change"));
    await sleep(0);
    const states = [...stateSel.options].map((o) => o.value);
    for (const st of states) {
      stateSel.value = st; stateSel.dispatchEvent(new Event("change"));
      await sleep(opts.wait ?? 90);
      renders++;
      results.push(...checkRoots(`${id}/${st}`));
    }
  }
  document.startViewTransition = vt;
  const uniq = [...new Set(results)];
  return { renders, problems: uniq.length, errors: [...new Set(window.__errs)], list: uniq.slice(0, opts.max || 80) };
};

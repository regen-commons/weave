// Pattern library behaviour: theme control, side-by-side themes, and each example's markup read from the page itself.
const THEME_KEY = "rc-theme";

function applyTheme(value) {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (value === "light" || value === "dark") {
    root.dataset.theme = value;
    meta.content = value;
  } else {
    delete root.dataset.theme;
    meta.content = "light dark";
  }
  try {
    if (value === "light" || value === "dark") localStorage.setItem(THEME_KEY, value);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Storage can be blocked. The choice still applies to this page.
  }
}

const themeSelect = document.querySelector("#theme");
if (themeSelect) {
  themeSelect.value = document.documentElement.dataset.theme ?? "system";
  themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
}

for (const stage of document.querySelectorAll("[data-theme-compare]")) {
  const source = stage.querySelector("template");
  for (const theme of ["light", "dark"]) {
    const section = document.createElement("div");
    section.dataset.theme = theme;
    section.setAttribute("aria-label", `${theme} theme`);
    section.setAttribute("role", "group");
    const clone = source.content.cloneNode(true);
    // Each theme needs its own tooltip targets when the example is shown twice.
    for (const element of clone.querySelectorAll("[id]")) element.id += `-${theme}`;
    for (const element of clone.querySelectorAll("[data-tooltip]")) {
      element.dataset.tooltip += `-${theme}`;
      element.setAttribute("interestfor", element.dataset.tooltip);
    }
    section.append(clone);
    stage.append(section);
  }
}

function dedent(html) {
  const lines = html.replace(/^\n+|\s+$/g, "").split("\n");
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length);
  const margin = Math.min(...indents);
  return lines.map((line) => line.slice(margin)).join("\n");
}

for (const example of document.querySelectorAll("[data-example]")) {
  const details = document.createElement("details");
  details.className = "lib-source";
  const summary = document.createElement("summary");
  summary.textContent = "Show markup";
  const pre = document.createElement("pre");
  pre.textContent = dedent(example.innerHTML);
  details.append(summary, pre);
  example.after(details);
}

for (const button of document.querySelectorAll("[data-open-dialog]")) {
  button.addEventListener("click", () => document.getElementById(button.dataset.openDialog)?.showModal());
}

// Local native overlay enhancements, shared with the app.
import { connectPopover, connectTooltip } from "../behaviors/overlays.js";
const tooltipDisposers = new WeakMap();
for (const trigger of document.querySelectorAll("[data-tooltip]")) {
  const panel = document.getElementById(trigger.dataset.tooltip);
  if (panel) tooltipDisposers.set(trigger, connectTooltip(trigger, panel));
}
for (const trigger of document.querySelectorAll("[data-popup]")) {
  const panel = document.getElementById(trigger.dataset.popup);
  if (panel) connectPopover(trigger, panel);
}
for (const example of document.querySelectorAll("[data-list-example]")) {
  const search = example.querySelector("input[type=search]");
  search.value = new URLSearchParams(location.search).get("q") ?? "";
  const grid = example.querySelector("[data-example-grid]");
  const records = [...example.querySelectorAll("[data-example-record]")];
  const checks = [...example.querySelectorAll("[data-example-country]")];
  function update() {
    const countries = checks.filter((check) => check.checked).map((check) => check.value);
    let count = 0;
    for (const record of records) {
      record.hidden = !record.textContent.toLowerCase().includes(search.value.trim().toLowerCase()) || (countries.length > 0 && !countries.includes(record.dataset.country));
      if (!record.hidden) count++;
    }
    const direction = example.querySelector("[data-example-sort]").value === "reverse" ? -1 : 1;
    records.sort((a, b) => direction * a.querySelector("h2").textContent.localeCompare(b.querySelector("h2").textContent)).forEach((record) => grid.append(record));
    example.querySelector("[data-example-count]").textContent = `${count} of ${records.length} examples`;
    const chips = example.querySelector("[data-example-chips]");
    chips.replaceChildren();
    for (const check of checks.filter((check) => check.checked)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rc-chip";
      button.textContent = `Remove ${check.value}`;
      button.addEventListener("click", () => { check.checked = false; update(); });
      chips.append(button);
    }
  }
  example.querySelector("[data-example-search]").addEventListener("submit", (event) => { event.preventDefault(); update(); });
  example.addEventListener("change", update);
  search.addEventListener("input", update);
}

// Describe examples keep edits in the current document; no files or words are sent.
const answerExample = document.querySelector("[data-example-answer]");
answerExample?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#example-words");
  if (!input.value.trim()) return;
  const item = document.createElement("li"); item.className = "rc-conversation-turn"; item.dataset.from = "person";
  const label = document.createElement("p"); label.className = "rc-conversation-label"; label.textContent = "You";
  const text = document.createElement("p"); text.className = "rc-message"; text.dataset.from = "person"; text.textContent = input.value.trim();
  item.append(label, text); document.querySelector("[data-example-conversation]").append(item); input.value = "";
});
document.querySelector("[data-example-edit]")?.addEventListener("click", (event) => {
  const field = document.querySelector("[data-example-edit-field]"); const text = document.querySelector("#example-answer"); const input = document.querySelector("#example-edit");
  if (field.hidden) { field.hidden = false; text.hidden = true; event.currentTarget.textContent = "Keep changes"; input.focus(); }
  else if (input.value.trim()) { text.textContent = input.value.trim(); field.hidden = true; text.hidden = false; event.currentTarget.textContent = "Edit your words"; }
});
document.querySelector("[data-example-file]")?.addEventListener("change", (event) => {
  for (const file of event.currentTarget.files ?? []) {
    const item = document.createElement("li"); item.className = "rc-attachment"; item.textContent = `${file.name}, local reference only`;
    document.querySelector("[data-example-attachments]").append(item);
  }
});
for (const button of document.querySelectorAll("[data-example-keep]")) button.addEventListener("click", () => {
  button.closest(".rc-proposal").dataset.state = "confirmed"; button.closest(".rc-proposal").querySelector(".rc-proposal-source").textContent = "Kept by you"; button.textContent = "Kept"; button.disabled = true;
});
for (const button of document.querySelectorAll("[data-example-remove]")) button.addEventListener("click", () => {
  const proposal = button.closest(".rc-proposal"); const value = proposal.querySelector("[data-example-proposal-value]");
  const keep = proposal.querySelector("[data-example-keep]");
  if (button.dataset.removed) { value.textContent = button.dataset.previous; delete button.dataset.removed; delete proposal.dataset.state; button.textContent = "Remove"; keep.disabled = false; proposal.querySelector(".rc-proposal-source").textContent = "Keyword guess. Check this."; }
  else { button.dataset.previous = value.textContent; value.textContent = "Removed from this example"; button.dataset.removed = "true"; proposal.dataset.state = "confirmed"; button.textContent = "Undo remove"; keep.disabled = true; proposal.querySelector(".rc-proposal-source").textContent = "Removed. Undo is available."; }
  keep.textContent = "Keep";
});
document.querySelector("[data-example-review]")?.addEventListener("submit", (event) => {
  event.preventDefault(); const pending = document.querySelector(".rc-proposal:not([data-state=confirmed])");
  document.querySelector("[data-example-review-status]").textContent = pending ? "Keep or remove each detail first." : "Example card checked. Nothing was shared.";
});
document.querySelector("#review-name")?.addEventListener("input", (event) => { document.querySelector("[data-example-preview]").textContent = event.currentTarget.value || "Your initiative"; });

// Need/offer review examples keep their state within the current page.
let askTooltipId = 0;
for (const list of document.querySelectorAll("[data-ask-demo]")) {
  const count = () => { list.querySelector("[data-ask-demo-count]").textContent = `${[...list.querySelectorAll("[data-ask-demo-item]")].filter(item => item.querySelector("[data-ask-demo-removed]").hidden).length} of 5`; };
  for (const item of list.querySelectorAll("[data-ask-demo-item]")) {
    const card = item.querySelector("[data-ask-demo-card]"), editor = item.querySelector("[data-ask-demo-editor]"), removed = item.querySelector("[data-ask-demo-removed]");
    const keep = item.querySelector("[data-ask-demo-keep]"), change = item.querySelector("[data-ask-demo-change]");
    const confirm = () => { delete card.dataset.pencil; card.dataset.kind = location.pathname.includes("offers") ? "offer" : "need"; card.querySelector("[data-ask-demo-source]").textContent = "Kept by you"; keep.disabled = true; keep.textContent = "Kept"; };
    keep.addEventListener("click", () => { confirm(); change.focus(); });
    change.addEventListener("click", () => {
      const current = new Set([...card.querySelectorAll(".rc-tag[data-capital]")].map(tag => tag.dataset.capital));
      for (const check of editor.querySelectorAll('input[name="kind"]')) check.checked = current.has(check.value);
      card.hidden = true; editor.hidden = false; editor.elements.title.focus();
    });
    editor.addEventListener("submit", event => {
      event.preventDefault(); const selected = [...editor.querySelectorAll('input[name="kind"]:checked')];
      editor.querySelector("[data-ask-demo-error]").hidden = !!selected.length;
      if (!selected.length) return;
      card.querySelector("[data-ask-demo-title]").textContent = editor.elements.title.value;
      const tags = card.querySelector("[data-ask-demo-tags]");
      for (const trigger of tags.querySelectorAll("[data-tooltip]")) tooltipDisposers.get(trigger)?.();
      tags.replaceChildren();
      for (const check of selected) {
        const [title, ...meaning] = check.parentElement.textContent.trim().split(":");
        const li = document.createElement("li"), wrap = document.createElement("span"), trigger = document.createElement("button"), tag = document.createElement("span"), tile = document.createElement("span"), panel = document.createElement("span");
        wrap.className = "rc-tooltip-wrap"; trigger.className = "rc-tooltip-trigger"; trigger.type = "button";
        panel.className = "rc-tooltip"; panel.id = `ask-demo-tip-${++askTooltipId}`; panel.setAttribute("popover", "hint"); panel.textContent = meaning.join(":").trim();
        trigger.dataset.tooltip = panel.id; trigger.setAttribute("interestfor", panel.id);
        tag.className = "rc-tag"; tag.dataset.capital = check.value; tile.className = "rc-tile"; tile.setAttribute("aria-hidden", "true"); tile.textContent = title.slice(0, 2);
        tag.append(tile, document.createTextNode(title)); trigger.append(tag); wrap.append(trigger, panel); li.append(wrap); tags.append(li);
        tooltipDisposers.set(trigger, connectTooltip(trigger, panel));
      }
      card.querySelector(".rc-ask-terms").textContent = `${editor.elements.scope.value}, Gift or exchange`;
      confirm(); editor.hidden = true; card.hidden = false; change.focus();
    });
    item.querySelector("[data-ask-demo-cancel]").addEventListener("click", () => { editor.hidden = true; card.hidden = false; change.focus(); });
    item.querySelector("[data-ask-demo-remove]").addEventListener("click", () => { card.hidden = true; removed.hidden = false; count(); removed.querySelector("button").focus(); });
    item.querySelector("[data-ask-demo-undo]").addEventListener("click", () => { card.hidden = false; removed.hidden = true; count(); change.focus(); });
  }
}
document.querySelector("[data-finish-demo-copy]")?.addEventListener("click", () => { const field = document.querySelector("[data-finish-demo-text]"); field.hidden = false; field.querySelector("textarea").focus(); field.querySelector("textarea").select(); });

for (const input of document.querySelectorAll('[data-team-example]')) input.addEventListener('change', () => { const picked = [...document.querySelectorAll('[data-team-example]:checked')]; document.querySelector('[data-team-example-status]').textContent = picked.length ? '1 of 2 example asks covered by 1 initiative. This does not establish eligibility.' : 'Pick a partner to see what they cover.'; });

// Settings demonstrations affect only the current fictional page.
const settingsExampleStatus = document.querySelector('[data-settings-example-status]');
for (const choice of document.querySelectorAll('[data-settings-example-choices] input, [data-settings-example-notify]')) choice.addEventListener('change', () => { settingsExampleStatus.textContent = 'Example choice changed. Nothing is published or emailed.'; });
document.querySelector('[data-settings-example-export]')?.addEventListener('click', () => {
  const data = {example: true, visibility: document.querySelector('[name="example-visibility"]:checked')?.value, reminder: document.querySelector('[data-settings-example-notify]').checked};
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'weave-settings-example.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  settingsExampleStatus.textContent = 'Example download started. It contains no real account data.';
});
document.querySelector('[data-settings-example-delete]')?.addEventListener('submit', event => {
  if(event.submitter?.value !== 'delete') return;
  document.querySelector('[name="example-visibility"][value="private"]').checked = true;
  document.querySelector('[data-settings-example-notify]').checked = false;
  settingsExampleStatus.textContent = 'Example choices cleared. No real record was deleted.';
});

/* Weave prototype: shared helpers and the screens for arriving and describing an initiative.
   Every screen is a render function that returns design-system markup for one state.
   Classes starting rc- come from the design system unchanged. Classes starting rcp- are proposed patterns in prototype.css. */
(function () {
  const D = window.WeaveData;
  const Screens = (window.WeaveScreens = window.WeaveScreens || {});
  const H = (window.WeaveH = {});

  const UNIVERSAL = { default: "Default", empty: "Empty", loading: "Loading", offline: "Offline", error: "Error", long: "Very long content" };
  H.UNIVERSAL = UNIVERSAL;

  H.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  H.icon = (name, size) => `<svg class="rc-icon"${size ? ` data-size="${size}"` : ""} aria-hidden="true"><use href="#${name}"/></svg>`;
  H.chevron = () => `<span class="rcp-chevron" aria-hidden="true">${H.icon("back", "sm")}</span>`;
  H.cap = (key) => D.capitals.find((c) => c.key === key);

  H.btn = (o) => {
    const tag = o.go ? "a" : "button";
    const attrs = [
      `class="rc-button${o.className ? " " + o.className : ""}"`,
      o.variant ? `data-variant="${o.variant}"` : "",
      o.size ? `data-size="${o.size}"` : "",
      o.width ? `data-width="${o.width}"` : "",
      o.go ? `href="#${o.go}" data-go="${o.go}"` : `type="${o.type || "button"}"`,
      o.act ? `data-act="${o.act}"` : "",
      o.arg != null ? `data-arg="${H.esc(o.arg)}"` : "",
      o.act && /^open-/.test(o.act) ? `aria-haspopup="dialog"` : "",
      o.busy ? `aria-busy="true"` : "",
      o.disabled ? "disabled" : "",
      o.id ? `id="${o.id}"` : "",
      o.attrs || "",
    ]
      .filter(Boolean)
      .join(" ");
    const inner = `${o.busy ? '<span class="rc-spinner" aria-hidden="true"></span>' : ""}${o.icon ? H.icon(o.icon, "sm") : ""}${H.esc(o.label)}`;
    return `<${tag} ${attrs}>${inner}</${tag}>`;
  };

  // Tooltips: a native hint popover opened by interest (hover, focus or long press) on its trigger. The app adds a small fallback where the browser lacks interestfor.
  let tipSeq = 0;
  H.tip = (inner, text, o = {}) => {
    const id = `tip-${++tipSeq}`;
    return `<button type="button" class="rcp-tip-trigger${o.className ? " " + o.className : ""}" interestfor="${id}"${o.label ? ` aria-label="${H.esc(o.label)}"` : ""}>${inner}</button><span popover="hint" id="${id}" class="rcp-tooltip">${H.esc(text)}</span>`;
  };

  // Kind of support: the framework's name on the tag, the plain meaning in the tooltip.
  H.tag = (key, state) => {
    const c = H.cap(key);
    return H.tip(`<span class="rc-tag" data-capital="${c.key}"><span class="rc-tile"${state ? ` data-state="${state}"` : ""} aria-hidden="true">${c.glyph}</span>${c.label}</span>`, c.tip);
  };
  H.tagList = (keys, state) => `<ul class="rc-tag-list rcp-tip-list">${keys.map((k) => `<li>${H.tag(k, state)}</li>`).join("")}</ul>`;
  H.plainTags = (labels) => `<ul class="rc-tag-list">${labels.map((l) => `<li><span class="rc-tag">${H.esc(l)}</span></li>`).join("")}</ul>`;

  // Type of work: outlined tag with its icon, explained in a tooltip.
  H.workTag = (lens) => {
    const info = D.lensInfo[lens] || {};
    return H.tip(`<span class="rc-tag rcp-work-tag">${H.icon(info.icon || "info", "sm")}${H.esc(lens)}</span>`, info.tip || lens);
  };
  H.workTags = (lenses) => (lenses && lenses.length ? `<ul class="rc-tag-list rcp-tip-list" aria-label="Type of work">${lenses.map((l) => `<li>${H.workTag(l)}</li>`).join("")}</ul>` : "");

  // A row of eight tiles. With a label it becomes one tooltip trigger that names the kinds in words.
  H.tileList = (statesByKey, label, o = {}) => {
    const tiles = D.capitals
      .map((c) => {
        const st = statesByKey[c.key] || "empty";
        const word = st === "kept" ? "kept" : st === "suggested" ? "suggested" : "none";
        return `<span role="listitem" data-capital="${c.key}"><span class="rc-tile"${st === "kept" ? "" : ` data-state="${st}"`} aria-hidden="true">${c.glyph}</span><span class="rc-visually-hidden">${c.label}: ${word}</span></span>`;
      })
      .join("");
    const list = `<span class="rc-tile-list" role="list" aria-label="${H.esc(label)}">${tiles}</span>`;
    if (!o.tip) return list;
    const held = D.capitals.filter((c) => statesByKey[c.key] && statesByKey[c.key] !== "empty");
    const text = held.length ? `${o.tip}: ${held.map((c) => `${c.label} (${c.plain.toLowerCase()})`).join(", ")}` : `${o.tip}: none listed yet`;
    return H.tip(list, text, { className: "rcp-tiles-trigger" });
  };

  H.stage = (key, opts = {}) =>
    `<span class="rc-stage" data-stage="${key}">${H.icon(opts.pencil ? "pencil-note" : key, "sm")}${D.stages[key]}${opts.pencil ? '<span class="rc-visually-hidden"> (suggested)</span>' : ""}</span>`;
  H.fit = (level, label, why) => {
    const html = `<span class="rc-fit" data-level="${level}"><span class="rc-fit-bar" aria-hidden="true"><i></i><i></i><i></i></span>${label || { strong: "Strong fit", good: "Good fit", possible: "Possible fit" }[level]}</span>`;
    return why ? H.tip(html, why) : html;
  };
  H.reasons = (list) => `<ul class="rc-reasons">${list.map((r) => `<li class="rc-reason">${H.icon(r.icon, "sm")}${H.esc(r.text)}</li>`).join("")}</ul>`;
  H.notice = (tone, title, body, actions, role) =>
    `<div class="rc-notice" data-tone="${tone}"${role ? ` role="${role}"` : ""}>${H.icon(tone === "success" ? "done" : tone === "info" ? "info" : "alert")}<div class="rc-notice-body">${title ? `<p class="rc-notice-title">${title}</p>` : ""}${body ? `<p>${body}</p>` : ""}${actions ? `<div class="rc-action-bar">${actions}</div>` : ""}</div></div>`;
  H.skeletonCard = (lines = 3, media) =>
    `<article class="rc-card" aria-hidden="true">${media ? '<span class="rcp-media"></span>' : ""}<span class="rc-skeleton" style="inline-size: 70%"></span>${Array.from({ length: lines - 1 }, (_, i) => `<span class="rc-skeleton" style="inline-size: ${90 - i * 15}%"></span>`).join("")}</article>`;
  H.skeletonList = (n, media) => `<ul class="rcp-card-grid" aria-busy="true">${Array.from({ length: n }, (_, i) => `<li style="--i:${i}">${H.skeletonCard(3, media)}</li>`).join("")}</ul>`;
  H.offlineNotice = (body) => H.notice("warning", "You are offline", body || "Your work is saved on this device. We try again when you reconnect.", "", "status");

  H.field = (o) => {
    const id = o.id;
    const hintId = o.hint ? `${id}-hint` : "";
    const errId = o.error ? `${id}-error` : "";
    const described = [hintId, errId].filter(Boolean).join(" ");
    const common = `class="rc-input" id="${id}" name="${o.name || id}"${described ? ` aria-describedby="${described}"` : ""}${o.error ? ' aria-invalid="true"' : ""}${o.required ? " required" : ""}${o.disabled ? " disabled" : ""}${o.attrs ? ` ${o.attrs}` : ""}`;
    let control;
    if (o.kind === "textarea") control = `<textarea ${common} rows="${o.rows || 3}">${H.esc(o.value || "")}</textarea>`;
    else control = `<input ${common} type="${o.type || "text"}" value="${H.esc(o.value || "")}">`;
    return `<div class="rc-field${o.className ? " " + o.className : ""}"><label for="${id}"${o.hiddenLabel ? ' class="rc-visually-hidden"' : ""}>${o.label}</label>${o.hint ? `<p class="rc-hint" id="${hintId}">${o.hint}</p>` : ""}${control}${o.error ? `<p class="rc-error" id="${errId}">${H.icon("alert", "sm")}${o.error}</p>` : ""}</div>`;
  };
  H.chip = (o) =>
    `<label class="rc-chip"><input class="rc-check"${o.id ? ` id="${o.id}"` : ""} type="${o.type || "checkbox"}" name="${o.name}" value="${H.esc(o.value)}"${o.checked ? " checked" : ""}${o.attrs ? ` ${o.attrs}` : ""}>${o.capital ? `<span class="rc-tile"${o.checked ? "" : ' data-state="empty"'} aria-hidden="true">${H.cap(o.capital).glyph}</span>` : ""}${o.icon ? H.icon(o.icon, "sm") : ""}${H.esc(o.label)}</label>`;
  H.removableChip = (label, act, arg) =>
    `<span class="rc-chip">${H.esc(label)}<button class="rc-chip-remove" type="button" aria-label="Remove ${H.esc(label)}" data-act="${act}" data-arg="${H.esc(arg)}">${H.icon("close", "sm")}</button></span>`;

  // Kinds of support guessed from words: the keyword tier the app falls back to when no assistant runs.
  H.guessCapitals = (text, fallback = true) => {
    const t = String(text || "").toLowerCase();
    const banks = { financial: ["r$", "us$", "€", "money", "grant", "pay", "fund", "cost", "dinheiro"], living: ["seed", "tree", "land", "water", "spring", "plant", "soil", "forest", "nascente", "muda"], material: ["fence", "tool", "equipment", "boat", "truck", "pump", "wire", "post", "cerca", "clearing", "kitchen"], intellectual: ["map", "research", "data", "method", "study", "hydrolog", "advice"], experiential: ["train", "workshop", "skill", "teach", "course", "walk", "school"], social: ["introduc", "partner", "network", "contact", "co-applicant", "fiscal host", "volunteer", "families", "together"], cultural: ["song", "story", "art", "festival", "film", "music"], spiritual: ["ceremony", "care", "prayer", "ritual", "spirit", "sit with"] };
    const found = Object.keys(banks).filter((k) => banks[k].some((w) => t.includes(w)));
    return found.length || !fallback ? found : ["social"];
  };

  // The live preview's guesses, made from what has been said or typed so far. Pencil, never stored.
  const PLACES = ["Alto Rio das Almas", "Rio das Almas", "Goiás", "Tocantins", "Cerrado", "Brazil", "Brasil", "Paranã", "Lagos", "Nigeria", "Costa Rica"];
  H.liveGuess = (text) => {
    const t = String(text || "");
    const lower = t.toLowerCase();
    const places = PLACES.filter((p) => lower.includes(p.toLowerCase())).filter((p, i, all) => !all.some((q) => q !== p && q.includes(p)));
    const m = t.match(/\b(?:[Ww]e are|[Cc]alled|[Nn]amed|[Ss]omos|[Cc]hamad[ao]s?)\s+(?:the\s+|a\s+|as\s+|os\s+)?([A-ZÀ-Ý][\wÀ-ÿ'’-]*(?:\s+(?:d[aeo]s?|of|the|and|e|[A-ZÀ-Ý][\wÀ-ÿ'’-]*)){0,6})/);
    const name = m ? m[1].replace(/\s+(?:d[aeo]s?|of|the|and|e)$/, "") : "";
    const since = (t.match(/\b(?:since|desde)\s+(\d{4})/i) || [])[1];
    return { name, place: places.slice(0, 2).join(", "), kinds: H.guessCapitals(t, false), since, words: t.trim() ? t.trim().split(/\s+/).length : 0 };
  };

  // Photographs once they are published with the prototype; drawn scenes until then.
  const SCENE_LABEL = { springs: "hills with a spring and young trees", forest: "a layered food forest", seeds: "a field of seed heads", map: "contour lines of a river basin", lagoon: "a lagoon at sunrise with mangroves", river: "a river house among trees", mangrove: "mangrove roots in a creek", grassland: "rolling grassland under a wide sky" };
  H.scene = (motif) => {
    const hills = (y, cls, amp) => `<path class="${cls}" d="M0 ${y} C 60 ${y - amp} 110 ${y - amp} 160 ${y - amp / 3} S 270 ${y + amp / 2} 320 ${y - amp / 2} V180 H0Z"/>`;
    const tree = (x, y, s) => `<path class="s-tree" d="M${x} ${y} l${-6 * s} 0 l${6 * s} ${-18 * s} l${6 * s} ${18 * s}z"/><rect class="s-tree" x="${x - 1}" y="${y}" width="2" height="${5 * s}"/>`;
    let body = "";
    switch (motif) {
      case "springs": body = `${hills(92, "s-far", 28)}${hills(120, "s-mid", 20)}<path class="s-water" d="M150 180 C 160 150 140 135 158 118 C 168 108 176 112 182 104 L 190 106 C 186 118 176 120 172 132 C 166 150 184 160 178 180Z"/>${hills(150, "s-near", 12)}${tree(70, 140, 1.2)}${tree(92, 146, 0.9)}${tree(232, 138, 1.1)}${tree(254, 144, 0.8)}<circle class="s-sun" cx="262" cy="38" r="16"/>`; break;
      case "forest": body = `${hills(110, "s-far", 18)}${Array.from({ length: 9 }, (_, i) => `<circle class="${i % 2 ? "s-mid" : "s-tree"}" cx="${20 + i * 36}" cy="${110 - (i % 3) * 14}" r="${26 - (i % 3) * 4}"/>`).join("")}${hills(150, "s-near", 10)}<rect class="s-earth" x="0" y="162" width="320" height="18"/>`; break;
      case "seeds": body = `<circle class="s-sun" cx="60" cy="44" r="18"/>${hills(118, "s-far", 14)}<rect class="s-gold" x="0" y="122" width="320" height="58"/>${Array.from({ length: 14 }, (_, i) => `<path class="s-copper" d="M${12 + i * 22} 180 q 3 -26 0 -44 q 8 6 6 14 q -4 10 -6 30z"/>`).join("")}`; break;
      case "map": body = `<rect class="s-earth" x="0" y="0" width="320" height="180"/>${[70, 54, 38, 22].map((r, i) => `<ellipse class="s-contour" cx="${120 + i * 6}" cy="${90 - i * 4}" rx="${r * 2}" ry="${r}"/>`).join("")}<path class="s-line" d="M0 150 C 80 120 120 150 170 100 S 260 60 320 70"/><circle class="s-water" cx="170" cy="100" r="6"/>`; break;
      case "lagoon": body = `<circle class="s-sun" cx="160" cy="98" r="30"/><rect class="s-water" x="0" y="100" width="320" height="80"/>${[118, 134, 150].map((y) => `<path class="s-line" d="M${40 + (y % 30)} ${y} h ${60 + (y % 40)} M ${190 - (y % 20)} ${y + 6} h 70"/>`).join("")}${tree(30, 104, 1.4)}${tree(290, 104, 1.2)}`; break;
      case "river": body = `${hills(96, "s-far", 22)}<path class="s-water" d="M0 150 C 90 120 150 170 220 140 S 300 130 320 136 V180 H0Z"/>${hills(130, "s-mid", 10)}<rect class="s-earth" x="196" y="96" width="44" height="30"/><path class="s-copper" d="M190 98 l28 -20 l28 20z"/>${tree(60, 128, 1.2)}${tree(84, 132, 0.9)}`; break;
      case "mangrove": body = `<rect class="s-water" x="0" y="110" width="320" height="70"/>${Array.from({ length: 5 }, (_, i) => { const x = 30 + i * 64; return `<circle class="s-tree" cx="${x}" cy="70" r="30"/><path class="s-root" d="M${x} 90 v 30 M${x} 98 q -14 8 -18 26 M${x} 98 q 14 8 18 26"/>`; }).join("")}`; break;
      default: body = `<circle class="s-sun" cx="250" cy="46" r="14"/>${hills(120, "s-far", 10)}${hills(140, "s-mid", 14)}${hills(162, "s-near", 8)}`;
    }
    return `<svg class="rcp-scene" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Example image: ${SCENE_LABEL[motif] || "a landscape"}"><rect class="s-sky" width="320" height="180"/>${body}</svg>`;
  };
  H.photosReady = false;
  H.media = (motif, size) => {
    const p = D.photos[motif];
    const inner = H.photosReady && p ? `<img src="${p.file}" alt="Example photo: ${H.esc(p.alt)}" loading="lazy" decoding="async" width="1200" height="675">` : H.scene(motif);
    return `<span class="rcp-media"${size ? ` data-size="${size}"` : ""}>${inner}</span>`;
  };
  H.linkPreview = (url) => {
    const p = D.previews[url];
    if (!p) return `<li class="rcp-link-preview"><span class="rcp-link-preview-text"><span class="rcp-link-preview-title"><a href="https://${H.esc(url)}" rel="noopener">${H.esc(url)}</a></span><span class="rcp-link-preview-host">No preview from this site</span></span></li>`;
    return `<li class="rcp-link-preview">${H.media(p.scene, "thumb")}<span class="rcp-link-preview-text"><span class="rcp-link-preview-title"><a href="https://${H.esc(url)}" rel="noopener">${H.esc(p.title)}</a></span><span class="rcp-link-preview-line">${H.esc(p.text)}</span><span class="rcp-link-preview-host">${H.esc(url.split("/")[0])}</span></span></li>`;
  };
  H.linkList = (urls) => (urls && urls.length ? `<ul class="rcp-link-list" aria-label="Links">${urls.map(H.linkPreview).join("")}</ul>` : "");

  // Partners are for initiatives on the list: saved and shared with the community. A private initiative sees funding only.
  H.canSeePartners = (s) => !!(s.saved && s.visibility === "community");
  H.partnersTarget = (s) => (H.canSeePartners(s) ? "partners-after" : "partners-before");

  // Footer: the same links everywhere; a slim version on the focused steps.
  H.footer = (ctx, o = {}) => {
    const s = ctx.s;
    const data = `<li><button type="button" class="rcp-footer-link" data-act="open-privacy" aria-haspopup="dialog">What we store</button></li><li><button type="button" class="rcp-footer-link" data-act="open-ledger" aria-haspopup="dialog">What the assistant did</button></li>`;
    const fiction = `<p class="rc-meta">Weave is a Regen Commons tool. Fictional example content: every organisation, fund, place and person here is invented for this prototype.</p>`;
    if (o.slim) return `<footer class="rcp-footer" data-slim><ul class="rcp-footer-row">${data}<li><a class="rcp-footer-link" href="https://regencommons.com" rel="noopener">regencommons.com</a></li></ul>${fiction}</footer>`;
    return `<footer class="rcp-footer"><div class="rcp-footer-grid">
      <section aria-labelledby="ft-weave"><h2 id="ft-weave" class="rcp-footer-title">Weave</h2><ul><li><a class="rcp-footer-link" href="#step1" data-go="step1">Describe your initiative</a></li><li><a class="rcp-footer-link" href="#${H.partnersTarget(s)}" data-go="${H.partnersTarget(s)}">Partners</a></li><li><a class="rcp-footer-link" href="#opportunities" data-go="opportunities">Funding</a></li><li><a class="rcp-footer-link" href="#directory" data-go="directory">Initiatives</a></li></ul></section>
      <section aria-labelledby="ft-data"><h2 id="ft-data" class="rcp-footer-title">Your data</h2><ul>${data}<li><a class="rcp-footer-link" href="#settings" data-go="settings">Settings</a></li></ul></section>
      <section aria-labelledby="ft-rc"><h2 id="ft-rc" class="rcp-footer-title">Regen Commons</h2><ul><li><a class="rcp-footer-link" href="https://regencommons.com" rel="noopener">regencommons.com</a></li><li><a class="rcp-footer-link" href="https://regencommons.com/join" rel="noopener">Membership</a></li><li><a class="rcp-footer-link" href="https://regencommons.com" rel="noopener">Data policy</a></li></ul></section>
    </div>${fiction}</footer>`;
  };

  // Page shell: header, main, footer, phone navigation. Focused steps keep the name, the save status and a slim footer.
  H.shell = (ctx, o) => {
    const s = ctx.s;
    const nav = o.nav;
    const sections = [
      { id: H.partnersTarget(s), key: "partners", label: "Partners", icon: "people" },
      { id: "opportunities", key: "funding", label: "Funding", icon: "funding" },
      { id: "directory", key: "directory", label: "Initiatives", icon: "search" },
    ];
    let status;
    if (s.saved) status = `<div class="rcp-header-end"><p class="rc-save-status" data-state="account">${H.icon("done", "sm")}Saved</p><a class="rc-button rcp-account" data-variant="quiet" data-size="sm" href="#settings" data-go="settings" aria-label="Your account and settings"><span class="rcp-avatar" aria-hidden="true">${H.esc((s.email || "a")[0].toUpperCase())}</span></a></div>`;
    else if (s.hasDraft) status = `<button class="rc-save-status" data-state="device" type="button" data-act="open-signin" data-arg="save" aria-haspopup="dialog">${H.icon("device", "sm")}Saved on this device only</button>`;
    else status = H.btn({ label: "Sign in", variant: "quiet", size: "sm", act: "open-signin", arg: "signin" });
    if (o.status === "none") status = "";
    const header = `<header class="rc-app-header"><a class="rc-logo" href="#home" data-go="home"><svg class="rc-logo-mark" aria-hidden="true"><use href="#mark"/></svg>Weave</a>${
      o.form ? "" : `<nav class="rc-app-nav" aria-label="Main">${sections.map((x) => `<a href="#${x.id}" data-go="${x.id}"${nav === x.key ? ' aria-current="page"' : ""}>${x.label}</a>`).join("")}</nav>`
    }${status}</header>`;
    const bottom = o.form
      ? ""
      : `<nav class="rc-bottom-nav" aria-label="Main"><a href="#home" data-go="home"${nav === "home" ? ' aria-current="page"' : ""}>${H.icon("home")}Home</a>${sections.map((x) => `<a href="#${x.id}" data-go="${x.id}"${nav === x.key ? ' aria-current="page"' : ""}>${H.icon(x.icon)}${x.label}</a>`).join("")}</nav>`;
    const main = o.hero
      ? `<main class="rcp-home" id="main" tabindex="-1"><div class="rcp-backdrop" aria-hidden="true"><canvas class="rcp-backdrop-canvas"></canvas></div>${o.hero}<div class="rc-main">${o.body}</div></main>`
      : `<main class="rc-main" id="main" tabindex="-1">${o.body}</main>`;
    return `<div class="rc-page"><a class="rc-skip-link" href="#main">Skip to content</a>${header}${main}${H.footer(ctx, { slim: o.form })}${bottom}</div>`;
  };

  H.stepper = (current) => {
    const steps = [
      { n: 1, label: "Initiative", go: "step1" },
      { n: 2, label: "Needs", go: "step2" },
      { n: 3, label: "Offers", go: "step3" },
    ];
    return `<ol class="rc-stepper" aria-label="Steps">${steps
      .map((st) => {
        if (st.n < current) return `<li data-state="done"><a href="#${st.go}" data-go="${st.go}"><span class="rc-stepper-mark">${H.icon("check", "sm")}</span><span class="rc-visually-hidden">Done: </span>${st.label}</a></li>`;
        if (st.n === current) return `<li aria-current="step"><span class="rc-stepper-mark" aria-hidden="true">${st.n}</span>${st.label}</li>`;
        return `<li><span class="rc-stepper-mark" aria-hidden="true">${st.n}</span>${st.label}</li>`;
      })
      .join("")}</ol>`;
  };

  // One line on where the assistant runs.
  H.guideStatus = (ctx) => {
    const s = ctx.s;
    if (s.ai === "none") return `<p class="rc-guide-status">${H.icon("device", "sm")}Assistant off. Nothing downloaded.</p>`;
    if (s.ai === "cloud") return `<p class="rc-guide-status">${H.icon("globe", "sm")}Cloud assistant, by your choice.</p>`;
    if (s.ai === "keywords") return `<p class="rc-guide-status">${H.icon("device", "sm")}Drafting from keywords on this device.</p>`;
    return `<p class="rc-guide-status">${H.icon("device", "sm")}Assistant on this device. Nothing leaves it.</p>`;
  };

  const isKept = (ctx, item) => !!(item.kept || ctx.s.kept[item.id]);
  H.isKept = isKept;

  // One need or offer as a line in the card: its kinds of support as tiles, then the words. Pencil until kept.
  const miniAsk = (ctx, item) => {
    const kept = isKept(ctx, item);
    const tiles = item.capitals.map((k) => `<span class="rc-tile" data-capital="${k}"${kept ? "" : ' data-state="suggested"'} aria-hidden="true">${H.cap(k).glyph}</span>`).join("");
    return `<li class="rcp-mini-ask"${kept ? "" : " data-pencil"}><span class="rcp-mini-tiles">${tiles}</span><span>${H.esc(item.title)}<span class="rc-visually-hidden">, ${item.capitals.map((k) => H.cap(k).label).join(" and ")}, ${kept ? "kept" : "suggested"}</span></span></li>`;
  };

  // The initiative card beside the form. Live mode fills in from the conversation as it goes.
  H.myCard = (ctx, o = {}) => {
    const me = ctx.me;
    const s = ctx.s;
    if (o.live) {
      const g = o.guess || { name: "", place: "", kinds: [] };
      const states = {};
      g.kinds.forEach((k) => (states[k] = "suggested"));
      return `<article class="rc-card" data-pencil id="live-card" aria-labelledby="pv-name"><header class="rc-card-header"><h2 class="rc-card-title" id="pv-name">${g.name ? H.esc(g.name) : "Your initiative"}</h2><p class="rc-card-meta"><span>${H.icon("place", "sm")}<span id="pv-place">${g.place ? H.esc(g.place) : "Where you work"}</span></span><span id="pv-since">${g.since ? `Since ${H.esc(g.since)}` : ""}</span></p></header><div><h3 class="rcp-preview-label">Kinds of support heard so far</h3><div id="pv-kinds">${H.tileList(states, "Kinds of support heard so far", { tip: "Heard so far" })}</div></div><p class="rc-meta" id="pv-note">${g.words ? `${g.words} words so far. All of this is a guess until you check it.` : "Fills in as you talk. Nothing leaves this device."}</p></article>`;
    }
    const stageKept = !!s.derivedKept.stage;
    const live = (list) => list.filter((n) => !s.removed[n.id]);
    const needs = live(me.needs);
    const offers = live(me.offers);
    const block = (label, list, mode) =>
      mode === "next"
        ? `<div><h3 class="rcp-preview-label">${label}</h3><p class="rc-meta">Comes next</p></div>`
        : `<div><h3 class="rcp-preview-label">${label}, ${list.length}</h3>${list.length ? `<ul class="rcp-mini-asks">${list.map((n) => miniAsk(ctx, n)).join("")}</ul>` : `<p class="rc-meta">None yet</p>`}</div>`;
    return `<article class="rc-card" data-stage="${me.derived.stage}" aria-labelledby="mc-title"><header class="rc-card-header"><h2 class="rc-card-title" id="mc-title">${H.esc(me.name)}</h2><p class="rc-card-meta"><span>${H.icon("place", "sm")}${H.esc(me.locations[0])}${me.locations.length > 1 ? ` and ${me.locations.length - 1} more` : ""}</span>${H.stage(me.derived.stage, { pencil: !stageKept })}</p></header>${block("Needs", needs, o.needs)}${block("Offers", offers, o.offers === "show" ? "show" : "next")}${o.actions || ""}</article>`;
  };

  // Need or offer terms in one line.
  const termsLine = (item, kind) => {
    const parts = [];
    if (item.amount) parts.push(item.amount);
    if (kind === "offer" && item.capacity) parts.push(item.capacity);
    if (item.scope) parts.push(D.scopes[item.scope]);
    if (kind === "need" && item.when) parts.push(item.when);
    if (item.terms && item.terms.length) parts.push(item.terms.map((t, i) => (i ? D.terms[t].toLowerCase() : D.terms[t])).join(" or "));
    return parts.join(" · ");
  };
  H.termsLine = termsLine;

  // Ask card: one need or offer, with every kind of support it carries shown alike. Pencil until kept, then ink.
  H.askCard = (ctx, item, kind, i) => {
    const s = ctx.s;
    if (s.removed[item.id]) {
      return `<li style="--i:${i}"><div class="rcp-add-card"><p class="rc-proposal-source">${H.icon("close", "sm")}Removed: ${H.esc(item.title)}</p><div class="rc-action-bar">${H.btn({ label: "Undo", variant: "quiet", size: "sm", act: "undo-remove", arg: item.id })}</div></div></li>`;
    }
    if (ctx.ui.editing === item.id) return `<li style="--i:${i}">${H.cardForm(ctx, item, kind)}</li>`;
    const kept = isKept(ctx, item);
    const actions = kept
      ? H.btn({ label: "Change", variant: "quiet", size: "sm", act: "edit", arg: item.id })
      : H.btn({ label: "Keep", variant: "secondary", size: "sm", act: "keep", arg: item.id }) + H.btn({ label: "Change", variant: "quiet", size: "sm", act: "edit", arg: item.id }) + H.btn({ label: "Remove", variant: "quiet", size: "sm", act: "remove", arg: item.id });
    return `<li style="--i:${i}"><article class="rc-card"${kept ? ` data-kind="${kind}"` : " data-pencil"}${ctx.ui.justKept === item.id ? " data-just-kept" : ""} aria-labelledby="t-${item.id}">
      ${H.tagList(item.capitals, kept ? undefined : "suggested")}
      <h3 class="rcp-ask-title" id="t-${item.id}">${H.esc(item.title)}</h3>
      ${item.line ? `<p class="rc-meta">${H.esc(item.line)}</p>` : ""}
      <p class="rc-meta">${H.esc(termsLine(item, kind))}</p>
      <div class="rcp-card-foot"><p class="rc-proposal-source">${kept ? H.icon("check", "sm") + "Kept" : H.icon("pencil-note", "sm") + (s.ai === "none" ? "Added by you" : "Suggested")}</p><div class="rc-action-bar">${actions}</div></div>
    </article></li>`;
  };

  // The full card form: kinds of support (several allowed), place scope, timeframe or capacity, exchange terms.
  H.cardForm = (ctx, item, kind) => {
    const isNeed = kind === "need";
    const id = item.id;
    const fin = item.capitals.includes("financial");
    return `<form class="rc-form rcp-card-form" data-act-submit="save-card" data-arg="${id}" aria-label="${isNeed ? "Change this need" : "Change this offer"}">
      ${H.field({ id: `${id}-title`, label: isNeed ? "What you need" : "What you can offer", value: item.title })}
      ${H.field({ id: `${id}-line`, label: "In a line", kind: "textarea", rows: 2, value: item.line })}
      <fieldset class="rc-choice-group"><legend>Kinds of support</legend><p class="rc-hint">Pick every kind it involves.</p><div class="rc-tag-list rcp-chip-row">${D.capitals.map((c) => H.chip({ name: `${id}-cap`, value: c.key, label: c.label, capital: c.key, checked: item.capitals.includes(c.key) })).join("")}</div></fieldset>
      ${isNeed && fin ? H.field({ id: `${id}-amount`, label: "Amount, with the currency", value: item.amount || "", attrs: 'inputmode="decimal"' }) : ""}
      ${isNeed ? H.field({ id: `${id}-when`, label: "When", hint: "A month and year is enough.", value: item.when || "" }) : H.field({ id: `${id}-capacity`, label: "How much, how often", value: item.capacity || "" })}
      <fieldset class="rc-choice-group"><legend>Where</legend><div class="rc-tag-list rcp-chip-row">${Object.keys(D.scopes).map((k) => H.chip({ type: "radio", name: `${id}-scope`, value: k, label: D.scopes[k], checked: item.scope === k })).join("")}</div></fieldset>
      <fieldset class="rc-choice-group"><legend>Terms you would accept</legend><div class="rc-tag-list rcp-chip-row">${Object.keys(D.terms).map((k) => H.chip({ name: `${id}-terms`, value: k, label: D.terms[k], checked: (item.terms || []).includes(k) })).join("")}</div></fieldset>
      <div class="rc-action-bar">${H.btn({ label: isNeed ? "Keep this need" : "Keep this offer", variant: "primary", type: "submit" })}${H.btn({ label: "Cancel", variant: "quiet", act: "cancel-edit" })}</div>
    </form>`;
  };

  // Code panel: one field per step, field and button at one height, the same height for both steps.
  H.codePanel = (ctx, o = {}) => {
    const s = ctx.s;
    const mode = o.mode || "email";
    const panelId = o.id || "keep";
    const wrap = (inner) => (o.bare ? `<div class="rcp-signin rcp-sheet-steps">${inner}</div>` : `<section class="rc-code-panel rcp-signin" aria-labelledby="${o.labelledBy || panelId}">${inner}</section>`);
    if (mode === "email") {
      return wrap(`${o.bare ? "" : `<header><h2 id="${panelId}" class="rc-code-panel-title">${o.title || "Save your initiative"}</h2></header>`}${o.intro ? `<p>${o.intro}</p>` : ""}
        ${o.notice || ""}
        <form class="rc-form" data-act-submit="send-code" data-arg="${o.resume || ""}">
          <div class="rcp-inline-field">${H.field({ id: `${panelId}-email`, name: "email", label: "Email", type: "email", value: o.email == null ? s.email : o.email, error: o.error, attrs: `autocomplete="email" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"${o.autofocus ? " autofocus" : ""}`, required: true, disabled: o.disabled })}${H.btn({ label: o.busy ? "Sending" : o.submitLabel || "Email me a code", variant: "primary", type: "submit", busy: o.busy, disabled: o.disabled })}</div>
        </form>
        <div class="rc-code-panel-actions">${o.secondary || ""}${o.noDismiss ? "" : H.btn({ label: "Not now", variant: "quiet", size: "sm", act: o.bare ? "close-sheet" : "not-now", arg: panelId })}${o.noPrivacy ? "" : H.btn({ label: "What we store", variant: "quiet", size: "sm", act: "open-privacy" })}</div>`);
    }
    const wait = o.resendIn;
    return wrap(`${o.bare ? "" : `<header><h2 id="${panelId}" class="rc-code-panel-title">Enter your code</h2></header>`}<p>We sent a code to <strong>${H.esc(s.email)}</strong>. It can take a minute.</p>
      ${o.notice || ""}
      <form class="rc-form" data-act-submit="check-code">
        <div class="rcp-inline-field">${H.field({ id: "code", name: "code", label: "Code from your email", value: o.value || "", error: o.error, attrs: `inputmode="numeric" autocomplete="one-time-code" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" maxlength="14" data-kind="code"${o.autofocus ? " autofocus" : ""}`, required: true, disabled: o.disabled })}${H.btn({ label: o.busy ? "Checking" : o.submitLabel || "Confirm", variant: "primary", type: "submit", busy: o.busy, disabled: o.disabled })}</div>
      </form>
      <div class="rc-code-panel-actions">${H.btn({ label: "Wrong email?", variant: "quiet", size: "sm", act: "wrong-email" })}${wait ? `<p class="rc-meta" role="status" id="resend-wait">New code in ${wait} s</p>` : H.btn({ label: "Send a new code", variant: "quiet", size: "sm", act: "resend" })}</div>
      ${o.help || ""}`);
  };

  // ----- Home -----
  const fundsSoon = () => D.opportunities.slice().sort((a, b) => a.closesISO.localeCompare(b.closesISO)).slice(0, 3);
  const daysLeft = (iso) => Math.round((new Date(iso) - new Date("2026-11-04")) / 86400000);
  H.daysLeft = daysLeft;

  Screens.home = {
    title: "Home",
    group: "Arrive",
    nav: "home",
    states: Object.assign({}, UNIVERSAL),
    render(ctx) {
      const st = ctx.state;
      const pt = st === "long";
      let live;
      if (st === "loading") live = `<p class="rc-meta" aria-busy="true"><span class="rc-skeleton" style="inline-size: 16rem"></span><span class="rc-visually-hidden">Loading what is new</span></p>`;
      else if (st === "empty") live = `<p class="rc-meta">No funds close in the next 30 days.</p>`;
      else if (st === "error" || st === "offline") live = "";
      else live = `<a class="rc-button" data-variant="quiet" data-size="sm" href="#opportunities" data-go="opportunities">${H.icon("clock", "sm")}${pt ? "12 fundos fecham em 30 dias" : "12 funds close in the next 30 days"}</a><a class="rc-button" data-variant="quiet" data-size="sm" href="#directory" data-go="directory">${H.icon("people", "sm")}${pt ? "7 iniciativas listadas" : "7 initiatives listed"}</a>`;
      const hero = `<section class="rcp-hero" aria-labelledby="home-title">
        <div class="rcp-hero-inner">
          <h1 id="home-title" class="rc-heading" data-size="hero">${pt ? "Encontre parceiros e financiamento para o <em>trabalho regenerativo</em>" : "Find partners and funding for <em>regenerative work</em>"}</h1>
          <p class="rcp-hero-lead">${pt ? "Conte sobre a sua iniciativa uma vez. Veja quem pode trabalhar com você e quais fundos se encaixam." : "Tell us about your initiative once. See who could work with you and which funds fit."}</p>
          <div class="rc-home-actions">${H.btn({ label: pt ? "Conte sobre a sua iniciativa" : "Describe your initiative", variant: "primary", size: "lg", go: "step1" })}${H.btn({ label: pt ? "Ver iniciativas" : "Browse initiatives", variant: "secondary", size: "lg", go: "directory" })}</div>
          <div class="rcp-hero-live">${live}</div>
        </div>
      </section>`;
      let notices = "";
      if (st === "error") notices = H.notice("warning", "We could not load the latest funds", "The list may be a few days old. Everything else works.", "", "status");
      if (st === "offline") notices = H.offlineNotice("You can still describe your initiative. It stays on this device until you save it.");
      const steps = [
        { title: pt ? "Conte sobre a sua iniciativa" : "Tell us about it", line: pt ? "Fale, escreva ou anexe. Fica no seu aparelho." : "Speak, type or add a deck. It stays on your device.", go: "step1" },
        { title: pt ? "Diga do que precisa e o que oferece" : "Say what you need and offer", line: pt ? "Até cinco de cada." : "Up to five of each. Money is one of eight kinds." },
        { title: pt ? "Veja quem se encaixa" : "See who fits", line: pt ? "Financiamento sempre; parceiros quando você compartilha." : "Funding right away. Partners once you share." },
      ];
      const recent = st === "loading"
        ? H.skeletonList(3, true)
        : st === "empty"
          ? `<section class="rc-empty" aria-labelledby="none-yet"><h3 id="none-yet" class="rc-empty-title">Nobody has shared yet</h3><p>Be the first initiative on the list.</p>${H.btn({ label: "Describe your initiative", variant: "primary", go: "step1" })}</section>`
          : `<ul class="rcp-card-grid">${D.directory.slice(0, 3).map((d, i) => `<li style="--i:${i}">${H.dirCard(ctx, d, { compact: true })}</li>`).join("")}</ul>`;
      const funds = st === "loading"
        ? H.skeletonList(3)
        : st === "empty"
          ? `<p class="rc-meta">No funds close in the next 30 days. The catalog is checked every Thursday.</p>`
          : `<ul class="rcp-card-grid">${fundsSoon().map((f, i) => `<li style="--i:${i}">${H.opportunityCard(ctx, f, { compact: true, soon: true })}</li>`).join("")}</ul>`;
      const body = `<div class="rc-stack" data-gap="wide">
        ${notices}
        <section class="rcp-section" aria-labelledby="how">
          <div class="rcp-section-head"><h2 id="how" class="rc-heading" data-size="section">${pt ? "Três passos, cerca de dez minutos" : "Three steps, about ten minutes"}</h2></div>
          <ol class="rcp-steps">${steps.map((x, i) => `<li class="rcp-step"${i === 0 ? " data-first" : ""} style="--i:${i}"><span class="rcp-step-number" aria-hidden="true">${i + 1}</span><h3 class="rcp-step-title">${x.go ? `<a href="#${x.go}" data-go="${x.go}">${x.title}</a>` : x.title}</h3><p class="rc-meta">${x.line}</p></li>`).join("")}</ol>
        </section>
        <section class="rcp-section" aria-labelledby="kinds">
          <div class="rcp-section-head"><h2 id="kinds" class="rc-heading" data-size="section">${pt ? "Dinheiro é um de oito tipos de apoio" : "Money is one of eight kinds of support"}</h2></div>
          <ul class="rcp-kinds">${D.capitals.map((c, i) => `<li data-capital="${c.key}" style="--i:${i}">${H.tip(`<span class="rcp-kind"><span class="rc-tile" aria-hidden="true">${c.glyph}</span><span class="rcp-kind-label">${c.label}</span><span class="rcp-kind-example">${c.plain}: ${c.example.toLowerCase()}</span></span>`, c.tip, { className: "rcp-kind-trigger" })}</li>`).join("")}</ul>
        </section>
        <section class="rcp-section" aria-labelledby="recent">
          <div class="rcp-section-head"><h2 id="recent" class="rc-heading" data-size="section">${pt ? "Compartilhadas recentemente" : "Recently shared"}</h2>${st === "empty" || st === "loading" ? "" : `<a class="rc-button" data-variant="quiet" data-size="sm" href="#directory" data-go="directory">Browse all 7</a>`}</div>
          ${recent}
        </section>
        <section class="rcp-section" aria-labelledby="soon">
          <div class="rcp-section-head"><h2 id="soon" class="rc-heading" data-size="section">${pt ? "Financiamento que fecha em breve" : "Funding closing soon"}</h2>${st === "empty" || st === "loading" ? "" : `<a class="rc-button" data-variant="quiet" data-size="sm" href="#opportunities" data-go="opportunities">See all funding</a>`}</div>
          ${funds}
        </section>
      </div>`;
      return H.shell(ctx, { nav: "home", hero, body });
    },
  };

  // ----- The conversation: voice first, typing and attachments beside it -----
  // The assistant asks one short thing at a time. People answer by speaking, or by typing when they cannot speak, and add files or links whenever they like.
  const turnsFor = (ctx, step) => ctx.s.convo[step] || [];
  H.convoLog = (ctx, step, o = {}) => {
    const turns = turnsFor(ctx, step);
    const items = turns.map((t, i) => {
      if (t.from === "assistant") return `<li class="rcp-turn" data-from="assistant"><p class="rc-message" data-from="assistant">${H.esc(t.text)}</p></li>`;
      if (ctx.ui.editingTurn === `${step}:${i}`) {
        return `<li class="rcp-turn" data-from="person"><form class="rcp-turn-edit" data-act-submit="save-turn" data-arg="${step}:${i}">${H.field({ id: `turn-${step}-${i}`, name: "text", label: "Your words", kind: "textarea", rows: 4, value: t.text })}<div class="rc-action-bar">${H.btn({ label: "Save", variant: "primary", size: "sm", type: "submit" })}${H.btn({ label: "Cancel", variant: "quiet", size: "sm", act: "cancel-turn" })}</div></form></li>`;
      }
      if (t.attachments) {
        return `<li class="rcp-turn" data-from="person"><ul class="rcp-turn-files" aria-label="Added">${t.attachments.map((a) => `<li class="rcp-turn-file">${H.icon(a.kind === "link" ? "globe" : "attach", "sm")}<span><strong>${H.esc(a.name)}</strong>${a.size ? `, ${H.esc(a.size)}` : ""}<span class="rc-meta"> ${H.esc(a.note)}</span></span></li>`).join("")}</ul></li>`;
      }
      return `<li class="rcp-turn" data-from="person"><p class="rc-message" data-from="person">${H.esc(t.text)}</p><p class="rcp-turn-meta">${t.via === "voice" ? `${H.icon("mic", "sm")}Spoken` : `${H.icon("edit", "sm")}Typed`}${H.btn({ label: "Change the words", variant: "quiet", size: "sm", act: "edit-turn", arg: `${step}:${i}` })}</p></li>`;
    });
    if (ctx.ui.recording && ctx.ui.recStep === step) items.push(`<li class="rcp-turn" data-from="person"><p class="rc-message" data-from="person" id="live-words" aria-live="polite">${H.esc(ctx.ui.live || "")}<span class="rcp-caret" aria-hidden="true"></span></p></li>`);
    if (o.thinking) items.push(`<li class="rcp-turn" data-from="assistant"><p class="rc-message" data-from="assistant" aria-busy="true"><span class="rcp-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="rc-visually-hidden">The assistant is reading</span></p></li>`);
    return `<ol class="rcp-convo-log" aria-label="Conversation">${items.join("")}</ol>`;
  };

  // The composer: one large Speak button, then typing, then a file or a link.
  H.composer = (ctx, step, o = {}) => {
    const s = ctx.s;
    const ui = ctx.ui;
    const tier = D.tiers[ctx.width === "phone" ? "phone" : "desktop"];
    const listening = ui.recording && ui.recStep === step;
    const preparing = ui.download === "speech";
    let voice;
    if (o.silent) voice = H.notice("danger", "We could not hear anything", "Twenty seconds of silence. Check that this site may use the microphone, or type instead.", H.btn({ label: "Try again", variant: "secondary", size: "sm", act: "rec-start", arg: step }), "alert");
    else if (preparing) voice = `<div class="rc-progress" aria-live="polite"><label for="speech-dl">Getting speech ready on this device: ${ui.progress || "0 MB"} of ${tier.speech}</label><progress id="speech-dl" max="100" value="${ui.pct || 0}">${ui.pct || 0} percent</progress><p class="rc-meta">Once, then it works offline. Your voice never leaves this device.</p><div class="rc-action-bar">${H.btn({ label: "Cancel", variant: "quiet", size: "sm", act: "model-cancel" })}</div></div>`;
    else voice = `<div class="rcp-voice" data-listening="${listening ? "true" : "false"}">${listening ? H.btn({ label: "Stop", variant: "secondary", size: "lg", icon: "mic", act: "rec-stop", arg: step, className: "rcp-speak" }) : H.btn({ label: o.speakLabel || "Speak", variant: "primary", size: "lg", icon: "mic", act: "rec-start", arg: step, className: "rcp-speak" })}<p class="rcp-voice-status" role="status">${listening ? `<span class="rcp-recorder-dot" aria-hidden="true"></span>Listening, ${ui.clock || "0:00"}<span class="rcp-level" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>` : s.speechReady || tier.speech === "0 MB" ? "Tap and talk. Your voice turns into text on this device." : `Tap and talk. The first time, speech to text downloads once (${tier.speech}).`}</p></div>`;
    return `<section class="rcp-composer" aria-label="Your answer">
      ${voice}
      <form class="rcp-typebar" data-act-submit="type-turn" data-arg="${step}"><label for="type-${step}">Or type</label><div class="rcp-inline-field"><textarea class="rc-input" id="type-${step}" name="text" rows="1"${listening ? " disabled" : ""}></textarea>${H.btn({ label: "Send", variant: "secondary", type: "submit", disabled: listening })}</div></form>
      <div class="rcp-attachbar"><button type="button" class="rc-button" data-variant="quiet" data-size="sm" popovertarget="attach-${step}">${H.icon("attach", "sm")}Add a file or link</button>
        <div popover id="attach-${step}" class="rcp-menu" aria-label="Add a file or link">
          <div class="rc-field rcp-file"><label for="file-${step}">A deck, PDF or document</label><p class="rc-hint" id="file-${step}-hint">Up to 25 MB. Read on this device, never uploaded.</p><input class="rcp-file-input" id="file-${step}" name="file" type="file" accept=".pdf,.docx,.pptx,.xlsx,.csv" aria-describedby="file-${step}-hint" data-step="${step}">${H.btn({ label: "Choose a file", variant: "secondary", size: "sm", act: "file-pick", arg: step })}</div>
          <form class="rc-form" data-act-submit="attach-link" data-arg="${step}">${H.field({ id: `link-${step}`, name: "link", label: "A website or social link", type: "url", hint: "Our server fetches the page and its preview. Only the link is sent.", attrs: 'inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false"' })}${H.btn({ label: "Add the link", variant: "secondary", size: "sm", type: "submit" })}</form>
        </div>
      </div>
    </section>`;
  };

  // The assistant download is offered once, slim, above the conversation: it downloads while people talk.
  H.modelPrompt = (ctx) => {
    const s = ctx.s;
    const st = ctx.state;
    const tier = D.tiers[ctx.width === "phone" ? "phone" : "desktop"];
    if (st === "weak") return H.notice("info", "This device cannot run the assistant", "Keep talking or typing and we draft from keywords, or use a cloud assistant for one step.", H.btn({ label: "Keep going", variant: "secondary", size: "sm", act: "model-skip" }) + H.btn({ label: "Use the cloud for this step", variant: "quiet", size: "sm", act: "open-consent" }));
    if (ctx.ui.download === "running") return `<div class="rc-progress" aria-live="polite"><label for="model-dl">Downloading the assistant: ${ctx.ui.progress || "0 MB"} of ${tier.size}</label><progress id="model-dl" max="100" value="${ctx.ui.pct || 0}">${ctx.ui.pct || 0} percent</progress><p class="rc-meta">Keep talking. It is ready before you build your card.</p><div class="rc-action-bar">${H.btn({ label: "Cancel", variant: "quiet", size: "sm", act: "model-cancel" })}</div></div>`;
    if (!s.modelReady && !s.modelSkipped && tier.builtIn && st !== "nobuiltin") return H.notice("info", "Build your card on this device", tier.builtInPitch, H.btn({ label: "Use this browser’s assistant", variant: "secondary", size: "sm", act: "model-builtin" }) + H.btn({ label: "Not now", variant: "quiet", size: "sm", act: "model-skip" }) + H.btn({ label: "Use the cloud instead", variant: "quiet", size: "sm", act: "open-consent" }));
    if (!s.modelReady && !s.modelSkipped) return H.notice("info", "Build your card on this device", `${tier.pitch} It downloads while you talk.`, H.btn({ label: `Download ${tier.size}`, variant: "secondary", size: "sm", act: "model-download" }) + H.btn({ label: "Not now", variant: "quiet", size: "sm", act: "model-skip" }) + H.btn({ label: "Use the cloud instead", variant: "quiet", size: "sm", act: "open-consent" }));
    return "";
  };

  // ----- Step 1: your initiative, as a conversation -----
  const STEP1_STATES = { default: "Talking", empty: "Start", listening: "Listening", attached: "Files and links added", loading: "Building the card", offline: "Offline", error: "Microphone silent", long: "Very long content", noai: "No assistant: four fields", weak: "Device too weak for the assistant", fresh: "First time speaking on a phone" };
  const seedTurns = (step, st) => {
    const all = D.convo[step];
    if (step === "initiative") {
      if (st === "empty") return all.slice(0, 1);
      if (st === "attached" || st === "loading" || st === "long") return all.slice();
      return all.slice(0, 3);
    }
    if (st === "empty") return all.slice(0, 1);
    return all.slice();
  };
  H.seedTurns = seedTurns;
  const personText = (turns) => turns.filter((t) => t.from === "person" && t.text).map((t) => t.text).join(" ");

  function step1Body(ctx) {
    const s = ctx.s;
    const st = ctx.state;
    const me = ctx.me;
    const noai = st === "noai" || s.ai === "none";
    let notices = "";
    if (st === "offline") notices += H.offlineNotice("Speaking and typing work on this device. Links wait for a connection.");
    let main;
    if (noai) {
      main = `<form class="rc-form" data-act-submit="draft" aria-label="Your initiative">
        ${H.field({ id: "f-name", label: "Name of your initiative", value: me.name })}
        ${H.field({ id: "f-where", label: "Where you work", hint: "Several places are fine, and so is global.", value: me.locations.join("; ") })}
        ${H.field({ id: "f-about", label: "About it", hint: "Two to four sentences.", kind: "textarea", rows: 4, value: me.description })}
        ${H.field({ id: "f-links", label: "Links", hint: "Optional.", value: me.links.join(", ") })}
        <div class="rc-action-bar">${H.btn({ label: "Continue", variant: "primary", type: "submit" })}${H.btn({ label: "Talk it through instead", variant: "quiet", act: "ai-on" })}</div>
      </form>`;
    } else {
      const building = st === "loading" || ctx.ui.building;
      const turns = turnsFor(ctx, "initiative");
      const answered = turns.some((t) => t.from === "person");
      main = `${H.modelPrompt(ctx)}
        ${H.convoLog(ctx, "initiative", { thinking: ctx.ui.thinking === "initiative" })}
        ${building ? `<div class="rc-progress" aria-live="polite"><label for="build-pg">Building your card on this device</label><progress id="build-pg" max="100" value="${ctx.ui.buildPct || 40}">${ctx.ui.buildPct || 40} percent</progress><p class="rc-meta">Reading everything you said, typed and added. About 20 seconds.</p></div>` : H.composer(ctx, "initiative", { silent: st === "error" })}
        ${answered && !building ? `<div class="rc-action-bar">${H.btn({ label: "Build my card", variant: "primary", act: "build-card" })}<p class="rc-meta">Works out your details and themes on this device.</p></div>` : ""}
        ${H.guideStatus(ctx)}
        <div class="rc-action-bar">${H.btn({ label: "Fill in four fields instead", variant: "quiet", act: "ai-off" })}</div>`;
    }
    const text = noai ? `${me.name}. ${me.locations[0]}. ${me.description}` : personText(turnsFor(ctx, "initiative")) + " " + (ctx.ui.live || "");
    const body = `<div class="rc-step-layout"><div class="rc-step-main">
      ${H.stepper(1)}
      <h1 class="rc-heading" data-size="page">Tell us about your initiative</h1>
      ${notices}
      ${main}
    </div>
    <aside class="rc-step-aside" aria-labelledby="preview-label"><h2 class="rcp-preview-label" id="preview-label">Your card, as it fills in</h2>${H.myCard(ctx, { live: true, guess: H.liveGuess(text) })}</aside></div>`;
    return H.shell(ctx, { form: true, body });
  }

  Screens.step1 = {
    title: "Step 1: tell us, by voice or typing",
    group: "Describe",
    states: STEP1_STATES,
    preset(s, fromList, st) { s.hasDraft = false; if (fromList) { s.saved = false; s.convo.initiative = seedTurns("initiative", st || "default"); if (st === "fresh") s.speechReady = false; else if (st && st !== "default" && st !== "empty") s.speechReady = true; } },
    render(ctx) {
      if (ctx.state === "listening" && !ctx.ui.recording) { ctx.ui.recording = true; ctx.ui.recStep = "initiative"; ctx.ui.clock = ctx.ui.clock || "0:07"; ctx.ui.live = ctx.ui.live || "Since 2019. Forty families, and the"; ctx.ui.listenDemo = true; }
      return step1Body(ctx);
    },
  };
  Screens["step1-download"] = {
    title: "Step 1: on-device assistant prompt",
    group: "Describe",
    states: { default: "Prompt", nobuiltin: "Computer without a built-in assistant", running: "Downloading", weak: "Device too weak for the assistant", offline: "Offline", error: "Download stopped", long: "Very long content" },
    preset(s, fromList, st) { s.modelReady = false; s.modelSkipped = false; s.ai = "keywords"; s.hasDraft = false; if (fromList) s.convo.initiative = seedTurns("initiative", "default"); },
    render(ctx) {
      if (ctx.state === "running") { ctx.ui.download = "running"; ctx.ui.progress = ctx.ui.progress || "71 MB"; ctx.ui.pct = ctx.ui.pct || 28; }
      let out = step1Body(ctx);
      if (ctx.state === "error") out = out.replace('<ol class="rcp-convo-log"', H.notice("danger", "The download stopped at 118 MB", "Your connection dropped. Nothing was lost, and it resumes from 118 MB.", H.btn({ label: "Resume", variant: "secondary", size: "sm", act: "model-download" }) + H.btn({ label: "Keep going without it", variant: "quiet", size: "sm", act: "model-skip" }), "alert") + '<ol class="rcp-convo-log"');
      return out;
    },
  };
  Screens["step1-consent"] = {
    title: "Step 1: cloud consent dialog",
    group: "Describe",
    states: { default: "Dialog open", session: "Dialog, session option checked", offline: "Offline", error: "Cloud call failed", long: "Very long content" },
    preset(s, fromList) { s.ai = "keywords"; s.modelSkipped = true; if (fromList) s.convo.initiative = seedTurns("initiative", "default"); },
    dialog: "consent",
    render(ctx) { let out = step1Body(ctx); if (ctx.state === "error") out = out.replace('<ol class="rcp-convo-log"', H.notice("danger", "The cloud assistant did not answer", "Nothing was kept there. Use the keyword draft, or try once more.", H.btn({ label: "Try once more", variant: "secondary", size: "sm", act: "open-consent" }) + H.btn({ label: "Use the keyword draft", variant: "quiet", size: "sm", go: "card" }), "alert") + '<ol class="rcp-convo-log"'); return out; },
  };

  // The consent dialog itself. Exact, complete, no metaphor.
  H.consentDialog = (ctx, sessionChecked) => {
    const c = D.cloud;
    return `<form class="rc-dialog-body" method="dialog">
      <div class="rcp-sheet-grabber" aria-hidden="true" data-grabber></div>
      <h2 id="proto-dialog-title" class="rc-dialog-title">Send this step to a cloud assistant?</h2>
      <p>This one step runs on a server instead of your device. You choose each time.</p>
      <dl class="rc-facts">
        <div><dt>Who runs it</dt><dd>${c.provider}, ${c.model}</dd></div>
        <div><dt>Where</dt><dd>${c.region}</dd></div>
        <div><dt>What is sent</dt><dd>${c.sent}</dd></div>
        <div><dt>Never sent</dt><dd>${c.notSent}</dd></div>
        <div><dt>How long it is kept</dt><dd>${c.retention}</dd></div>
        <div><dt>What we keep</dt><dd>The time and the word count, never the text.</dd></div>
      </dl>
      <label class="rc-chip"><input class="rc-check" type="checkbox" name="session" value="yes"${sessionChecked ? " checked" : ""}>Also use it for my next steps this session</label>
      <div class="rc-action-bar">${H.btn({ label: "Send this step once", variant: "primary", type: "submit" })}<button class="rc-button" data-variant="quiet" value="no" formnovalidate>Keep it on this device</button></div>
    </form>`;
  };

  // ----- Check your card: details to keep on the left, the card on the right -----
  Screens.card = {
    title: "Check your card",
    group: "Describe",
    states: Object.assign({}, UNIVERSAL, { correcting: "Correcting a detail", kept: "All details kept" }),
    preset(s, fromList) { s.hasDraft = true; if (fromList) s.saved = false; },
    render(ctx) {
      const s = ctx.s;
      const st = ctx.state;
      const me = ctx.me;
      const d = me.derived;
      const kept = (k) => st === "kept" || s.derivedKept[k];
      const editing = st === "correcting" ? ctx.ui.correcting || "stage" : ctx.ui.correcting;
      const source = (k) => `<p class="rc-proposal-source">${kept(k) ? H.icon("check", "sm") + "Kept" : H.icon("pencil-note", "sm") + (st === "error" || s.ai === "keywords" || s.ai === "none" ? "Guessed from keywords" : "Suggested")}</p>`;
      const actions = (k) => `<div class="rc-action-bar">${kept(k) ? H.btn({ label: "Change", variant: "quiet", size: "sm", act: "correct", arg: k }) : H.btn({ label: "Keep", variant: "secondary", size: "sm", act: "keep-derived", arg: k }) + H.btn({ label: "Change", variant: "quiet", size: "sm", act: "correct", arg: k }) + H.btn({ label: "Remove", variant: "quiet", size: "sm", act: "remove-derived", arg: k })}</div>`;
      const row = (k, label, valueHtml) => {
        if (s.removedDerived && s.removedDerived[k]) return `<li class="rc-proposal" data-state="confirmed"><p class="rc-proposal-source">${H.icon("close", "sm")}${label} removed. We will not guess it again.</p><div class="rc-action-bar">${H.btn({ label: "Undo", variant: "quiet", size: "sm", act: "undo-derived", arg: k })}</div></li>`;
        if (editing === k) return `<li class="rc-proposal">${correctForm(ctx, k)}</li>`;
        return `<li class="rc-proposal"${kept(k) ? ' data-state="confirmed"' : ""}${ctx.ui.justKept === k ? " data-just-kept" : ""}>${source(k)}<p class="rc-record-label rc-meta">${label}</p><div class="rc-proposal-value">${valueHtml}</div>${actions(k)}</li>`;
      };
      const placeChips = d.places.map((p) => `<li><span class="rc-tag">${H.icon(p.kind === "Watershed" ? "watershed" : p.kind === "Country" ? "globe" : "place", "sm")}${H.esc(p.name)}<span class="rc-visually-hidden">, ${p.kind.toLowerCase()}</span></span></li>`).join("");
      let notices = ctx.ui.flash ? H.notice(ctx.ui.flash.tone, ctx.ui.flash.title, ctx.ui.flash.body, "", "status") : "";
      if (st === "offline") notices += H.offlineNotice("Your card is on this device. Places were matched from the maps saved with the app.");
      if (st === "error") notices += H.notice("warning", "The assistant could not read your words", "These details are keyword guesses, so check them. The four fields are exactly what you said.", "", "status");
      const loading = st === "loading";
      const fields = `<article class="rc-card" aria-labelledby="public-fields"><header class="rc-card-header"><h2 id="public-fields" class="rc-card-title">What people see first</h2><p class="rc-card-meta"><span>${H.icon("edit", "sm")}Yours to edit</span></p></header>
        <form class="rc-form" data-act-submit="save-fields">
          ${H.field({ id: "c-name", label: "Name", value: me.name })}
          <div class="rc-field"><label for="c-where">Where you work</label><div class="rc-tag-list rcp-chip-row">${me.locations.map((l) => H.removableChip(l, "remove-location", l)).join("")}</div><input class="rc-input" id="c-where" name="where" placeholder="Add a place"></div>
          ${H.field({ id: "c-about", label: "About it", kind: "textarea", rows: 4, value: me.description })}
          <div class="rc-field"><label for="c-link">Links</label><ul class="rc-tag-list rcp-chip-row">${me.links.map((l) => `<li>${H.removableChip(l, "remove-link", l)}</li>`).join("")}</ul><input class="rc-input" id="c-link" name="link" type="url" placeholder="Add a link" inputmode="url"></div>
        </form></article>`;
      const review = loading
        ? `<section class="rc-review" aria-label="Details being worked out"><h2 class="rc-heading" data-size="section">Worked out from what you shared</h2><p class="rc-guide-status" aria-busy="true">${H.icon("device", "sm")}Reading on this device, about 20 seconds</p>${H.skeletonList(3)}</section>`
        : `<section class="rc-review" aria-labelledby="derived"><header class="rc-card-list-header"><h2 id="derived" class="rc-heading" data-size="section">Worked out from what you shared</h2>${st === "kept" ? "" : H.btn({ label: "Keep all", variant: "quiet", size: "sm", act: "keep-all-derived" })}</header>
          <ul class="rc-review-list rcp-review-grid">
            ${row("stage", "Stage", H.stage(d.stage))}
            ${row("lenses", "Type of work", H.workTags(d.lenses))}
            ${row("themes", "Themes", H.plainTags(d.themes))}
            ${row("places", "Place", `<ul class="rc-tag-list">${placeChips}</ul>`)}
            ${row("languages", "Languages", H.plainTags(d.languages))}
            ${row("beneficiaries", "Who it serves", `<p>${H.esc(d.beneficiaries)}</p>`)}
          </ul>
          <p class="rc-meta">We never ask for a legal form here. If a fund needs one, add it from that fund.</p>
        </section>`;
      const body = `<div class="rc-step-layout"><div class="rc-step-main">
        ${H.stepper(1)}
        <h1 class="rc-heading" data-size="page">Check your card</h1>
        ${notices}
        ${H.guideStatus(ctx)}
        ${review}
        ${fields}
        <div class="rc-action-bar">${H.btn({ label: "Next: what you need", variant: "primary", go: "step2" })}${H.btn({ label: "Back to the conversation", variant: "quiet", go: "step1" })}</div>
      </div>
      <aside class="rc-step-aside" aria-labelledby="preview-label"><h2 class="rcp-preview-label" id="preview-label">Your card</h2>${H.myCard(ctx, { needs: "next" })}</aside></div>`;
      return H.shell(ctx, { form: true, body });
    },
  };

  function correctForm(ctx, k) {
    const d = ctx.me.derived;
    let body = "";
    if (k === "stage") {
      body = `<fieldset class="rc-choice-group"><legend>Stage</legend>${Object.keys(D.stages).map((key) => `<label class="rc-choice"><input class="rc-check" type="radio" name="stage" value="${key}"${d.stage === key ? " checked" : ""}><span class="rc-choice-text"><span class="rc-choice-title">${H.icon(key, "sm")}${D.stages[key]}</span><span class="rc-choice-note">${D.stageTips[key].split(": ")[1]}</span></span></label>`).join("")}</fieldset>`;
    } else if (k === "lenses") {
      body = `<fieldset class="rc-choice-group"><legend>Type of work</legend><div class="rc-tag-list rcp-chip-row">${D.lenses.map((l) => H.chip({ name: "lens", value: l, label: l, icon: D.lensInfo[l].icon, checked: d.lenses.includes(l) })).join("")}</div></fieldset>`;
    } else if (k === "themes" || k === "languages") {
      const list = d[k];
      body = `<div class="rc-field"><label for="add-${k}">${k === "themes" ? "Themes" : "Languages"}</label><div class="rc-tag-list rcp-chip-row">${list.map((l) => H.removableChip(l, "remove-" + k, l)).join("")}</div><input class="rc-input" id="add-${k}" placeholder="Add one"></div>`;
    } else if (k === "places") {
      body = `<div class="rc-field"><label for="add-place">Place</label><p class="rc-hint">From your locations. Remove one that is wrong.</p><div class="rc-tag-list rcp-chip-row">${d.places.map((p) => H.removableChip(`${p.name} (${p.kind.toLowerCase()})`, "remove-place", p.name)).join("")}</div><input class="rc-input" id="add-place" placeholder="Search a place"></div>`;
    } else {
      body = H.field({ id: "edit-" + k, label: "Who it serves", value: d.beneficiaries });
    }
    return `<form class="rc-form" data-act-submit="save-correction" data-arg="${k}" aria-label="Correct this detail">${body}<div class="rc-action-bar">${H.btn({ label: "Save", variant: "primary", size: "sm", type: "submit" })}${H.btn({ label: "Cancel", variant: "quiet", size: "sm", act: "cancel-correct" })}</div></form>`;
  }

  // ----- Steps 2 and 3: talk on the left, cards appear on the right, five at most -----
  function stepBody(ctx, kind) {
    const s = ctx.s;
    const st = ctx.state;
    const me = ctx.me;
    const isNeed = kind === "need";
    const limit = D.limits[kind];
    const step = kind;
    const turns = turnsFor(ctx, step);
    const answered = st !== "empty" && turns.some((t) => t.from === "person");
    const extra = isNeed
      ? [{ id: "n4", title: "Volunteers for planting days", line: "Twenty people for two weekends in November.", capitals: ["social", "experiential"], kept: false, scope: "region", when: "November 2027", terms: ["gift"] }, { id: "n5", title: "A pickup truck for seedlings", line: "To carry seedlings from the nursery to the springs.", capitals: ["material"], kept: false, scope: "here", when: "Rainy season 2027", terms: ["exchange", "commitment"] }, { id: "n6", title: "Help writing grant reports", line: "Someone who has reported to an international funder before.", capitals: ["experiential", "intellectual"], kept: false, scope: "anywhere", when: "From January 2027", terms: ["exchange"] }]
      : [{ id: "o5", title: "Native seed from our own valley", line: "A few kilos a year of species from the upper valley.", capitals: ["living"], kept: false, capacity: "A few kilos a year", scope: "region", terms: ["gift", "exchange"] }, { id: "o6", title: "A guide to running monthly work days", line: "How forty families keep the work going.", capitals: ["intellectual", "experiential"], kept: false, capacity: "Anytime", scope: "anywhere", terms: ["gift"] }];
    const items = isNeed ? me.needs : me.offers;
    const found = !answered ? [] : st === "long" ? items.concat(extra) : items;
    const list = found.slice(0, limit);
    const active = list.filter((i) => !s.removed[i.id]).length;
    let notices = "";
    if (st === "offline") notices = H.offlineNotice("Speaking, typing and the assistant on your device still work.");
    if (st === "error") notices = H.notice("warning", "The assistant could not read that", `We split your words into ${isNeed ? "needs" : "offers"} by keywords. Check the kinds of support.`, "", "status");
    let cards;
    if (st === "loading") cards = `<p class="rc-guide-status" aria-busy="true">${H.icon("device", "sm")}Making cards from what you said</p>${H.skeletonList(2)}`;
    else if (!list.length) cards = `<p class="rc-meta">Cards appear here as you talk. Up to five.</p>`;
    else {
      const more = found.length > limit ? `<p class="rc-meta">We heard ${found.length}. These are the first five; remove one to add another.</p>` : "";
      const limitNote = active >= limit ? `<p class="rc-meta">Five is the limit. Partners and funders read the first few.</p>` : `${H.btn({ label: isNeed ? "Add a need by hand" : "Add an offer by hand", variant: "quiet", size: "sm", act: "add-blank", arg: kind })}`;
      cards = `${more}<ul class="rcp-ask-stack" aria-label="${isNeed ? "Your needs" : "Your offers"}">${list.map((i, n) => H.askCard(ctx, i, kind, n)).join("")}</ul>${limitNote}`;
    }
    const next = isNeed ? H.btn({ label: "Next: what you can offer", variant: "primary", go: "step3" }) : H.btn({ label: "Finish: see what fits", variant: "primary", go: "finish" });
    const body = `<div class="rc-step-layout"><div class="rc-step-main">
      ${H.stepper(isNeed ? 2 : 3)}
      <h1 class="rc-heading" data-size="page">${isNeed ? "What does your initiative need?" : "What can your initiative offer?"}</h1>
      ${notices}
      ${H.convoLog(ctx, step, { thinking: ctx.ui.thinking === step })}
      ${H.composer(ctx, step, { silent: false, speakLabel: answered ? "Say more" : "Speak" })}
      ${H.guideStatus(ctx)}
      <div class="rc-action-bar">${next}${H.btn({ label: isNeed ? "Back to your card" : "Back to your needs", variant: "quiet", go: isNeed ? "card" : "step2" })}</div>
    </div>
    <aside class="rc-step-aside rcp-ask-aside" aria-labelledby="asks-label"><div class="rcp-section-head"><h2 class="rcp-preview-label" id="asks-label">${isNeed ? "Your needs" : "Your offers"}</h2><p class="rcp-counter" id="ask-count">${active} of ${limit}</p></div>${cards}</aside></div>`;
    return H.shell(ctx, { form: true, body });
  }

  const askPreset = (step) => (s, fromList, st) => { s.hasDraft = true; if (fromList) { s.saved = false; s.convo[step] = seedTurns(step, st || "default"); } };
  Screens.step2 = {
    title: "Step 2: your needs",
    group: "Describe",
    states: Object.assign({}, UNIVERSAL, { long: "Very long content (more than five heard)", editing: "Changing a need" }),
    preset: askPreset("need"),
    render(ctx) { if (ctx.state === "editing" && !ctx.ui.editing) ctx.ui.editing = "n2"; return stepBody(ctx, "need"); },
  };
  Screens.step3 = {
    title: "Step 3: your offers",
    group: "Describe",
    states: Object.assign({}, UNIVERSAL, { long: "Very long content (more than five heard)", editing: "Changing an offer" }),
    preset: askPreset("offer"),
    render(ctx) { if (ctx.state === "editing" && !ctx.ui.editing) ctx.ui.editing = "o2"; return stepBody(ctx, "offer"); },
  };
})();

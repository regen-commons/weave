/* Weave prototype: screens for matches, saving and browsing, and the sheets and pop-ups that open over them. */
(function () {
  const D = window.WeaveData;
  const Screens = window.WeaveScreens;
  const H = window.WeaveH;
  const U = H.UNIVERSAL;

  const partnerName = (ctx, p) => (ctx.state === "long" && p.longName ? p.longName : p.name);
  const partnersFor = (ctx) => (ctx.state === "empty" ? [] : ctx.state === "long" ? D.partners.concat(D.partners.map((p) => Object.assign({}, p, { id: p.id + "b", name: p.name + " (second group)", longName: (p.longName || p.name) + " (segundo grupo)" }))) : D.partners);
  const fundsFor = (ctx) => (ctx.state === "empty" ? [] : ctx.state === "long" ? D.opportunities.concat(D.opportunities.map((f) => Object.assign({}, f, { id: f.id + "b", title: f.title.replace("from the", "second round of the"), funder: f.funder + ", second round" }))) : D.opportunities);
  const findInit = (id) => D.directory.find((x) => x.id === id) || D.partners.find((x) => x.id === id);
  const shared = (ctx) => ctx.s.visibility === "community";
  H.shared = shared;
  const stamp = (text, stale, action) => `<div class="rc-stamp">${stale ? `<span class="rc-time" data-stale>${H.icon("alert", "sm")}${text}</span>` : `<time class="rc-time">${text}</time>`}${action || ""}</div>`;
  const grid = (items, fn, label) => `<ul class="rcp-card-grid"${label ? ` aria-label="${label}"` : ""}>${items.map((x, i) => `<li style="--i:${i}">${fn(x, i)}</li>`).join("")}</ul>`;
  const dismissReasons = (id, reasons) => `<fieldset class="rc-choice-group"><legend>Why is it not a fit?</legend><div class="rc-tag-list rcp-chip-row">${reasons.map((r) => `<button class="rc-chip" type="button" data-act="dismiss-reason" data-arg="${id}|${r}">${r}</button>`).join("")}</div><div class="rc-action-bar">${H.btn({ label: "Cancel", variant: "quiet", size: "sm", act: "cancel-dismiss" })}</div></fieldset>`;
  const hidden = (label, id) => `<article class="rc-card"><p class="rc-meta">Hidden: ${H.esc(label)}.</p><div class="rc-action-bar">${H.btn({ label: "Undo", variant: "quiet", size: "sm", act: "undo-dismiss", arg: id })}</div></article>`;
  const shortDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  // ----- The filter bar: search, then filter menus, then sort; chosen filters show as chips -----
  const filtersFor = (ctx, key) => (ctx.ui.filters && ctx.ui.filters[key]) || {};
  H.filtersFor = filtersFor;
  const COUNTRIES = ["Brazil", "Costa Rica", "Nigeria", "Several countries"];
  const MENUS = {
    lenses: { label: "Type of work", type: "check", options: () => D.lenses.map((l) => ({ value: l, label: l, icon: D.lensInfo[l].icon })) },
    kinds: { label: "Support", type: "check", options: () => D.capitals.map((c) => ({ value: c.key, label: `${c.label}, ${c.plain.toLowerCase()}`, short: c.label, capital: c.key })) },
    match: { label: "Support", type: "check", options: () => [{ value: "offers", label: "Offers what you need" }, { value: "needs", label: "Needs what you offer" }].concat(D.capitals.map((c) => ({ value: c.key, label: `${c.label}, ${c.plain.toLowerCase()}`, short: c.label, capital: c.key }))) },
    places: { label: "Place", type: "check", options: () => COUNTRIES.map((c) => ({ value: c, label: c })) },
    closes: { label: "Closes", type: "radio", options: () => [{ value: "", label: "Any time" }, { value: "30", label: "Within 30 days" }, { value: "90", label: "Within 90 days" }, { value: "180", label: "Within 6 months" }] },
  };
  const menuValues = (f, name) => [].concat(f[name] || []).filter((v) => v !== "");
  const menu = (key, name, f, o = {}) => {
    const m = MENUS[name];
    const values = menuValues(f, name);
    const id = `${key}-menu-${name}`;
    const opts = m.options().map((op, i) => `<label class="rcp-menu-option"><input class="rc-check" type="${m.type === "radio" ? "radio" : "checkbox"}" id="${key}-${name}-${i}" name="${name}" value="${H.esc(op.value)}" data-list="${key}"${(m.type === "radio" ? (f[name] || "") === op.value : values.includes(op.value)) ? " checked" : ""}>${op.capital ? `<span class="rc-tile" data-capital="${op.capital}" aria-hidden="true">${H.cap(op.capital).glyph}</span>` : ""}${op.icon ? H.icon(op.icon, "sm") : ""}<span>${H.esc(op.label)}</span></label>`).join("");
    const scope = o.scope ? `<fieldset class="rcp-menu-group"><legend>Look in</legend>${[["", "Needs and offers"], ["offer", "What they offer"], ["need", "What they need"]].map(([v, l], i) => `<label class="rcp-menu-option"><input class="rc-check" type="radio" id="${key}-kindIn-${i}" name="kindIn" value="${v}" data-list="${key}"${(f.kindIn || "") === v ? " checked" : ""}><span>${l}</span></label>`).join("")}</fieldset>` : "";
    const count = m.type === "radio" ? (f[name] ? 1 : 0) : values.length;
    return `<button type="button" class="rc-button rcp-filter-button" data-variant="secondary" data-size="sm" popovertarget="${id}"${count ? " data-active" : ""}>${o.label || m.label}${count ? `<span class="rcp-count">${count}</span>` : ""}${H.chevron()}</button>
      <div popover id="${id}" class="rcp-menu" data-list="${key}" aria-label="${H.esc(o.label || m.label)}">${scope}<fieldset class="rcp-menu-group"><legend>${H.esc(o.label || m.label)}</legend>${opts}</fieldset><div class="rc-action-bar">${H.btn({ label: "Clear", variant: "quiet", size: "sm", act: "filter-clear", arg: `${key}:${name}` })}<button type="button" class="rc-button" data-variant="primary" data-size="sm" popovertarget="${id}" popovertargetaction="hide">Done</button></div></div>`;
  };
  const sortMenu = (key, sorts, f) => {
    const id = `${key}-menu-sort`;
    const cur = f.sort || sorts[0][0];
    const label = sorts.find(([v]) => v === cur)[1];
    return `<button type="button" class="rc-button rcp-filter-button" data-variant="quiet" data-size="sm" popovertarget="${id}">Sort: ${label}${H.chevron()}</button>
      <div popover id="${id}" class="rcp-menu" data-list="${key}" aria-label="Sort"><fieldset class="rcp-menu-group"><legend>Sort by</legend>${sorts.map(([v, l], i) => `<label class="rcp-menu-option"><input class="rc-check" type="radio" id="${key}-sort-${i}" name="sort" value="${v}" data-list="${key}"${v === cur ? " checked" : ""}><span>${l}</span></label>`).join("")}</fieldset><div class="rc-action-bar"><button type="button" class="rc-button" data-variant="primary" data-size="sm" popovertarget="${id}" popovertargetaction="hide">Done</button></div></div>`;
  };
  const activeChips = (key, names, f) => {
    const chips = [];
    names.forEach((name) => {
      const m = MENUS[name];
      if (m.type === "radio") { if (f[name]) { const op = m.options().find((o) => o.value === f[name]); chips.push(H.removableChip(op ? op.label : f[name], "filter-remove", `${key}:${name}:${f[name]}`)); } return; }
      menuValues(f, name).forEach((v) => { const op = m.options().find((o) => o.value === v); chips.push(H.removableChip(op ? op.short || op.label : v, "filter-remove", `${key}:${name}:${v}`)); });
    });
    if (f.q) chips.unshift(H.removableChip(`“${f.q}”`, "filter-remove", `${key}:q:`));
    return chips;
  };
  H.filterBar = (ctx, key, o) => {
    const f = filtersFor(ctx, key);
    const chips = activeChips(key, o.menus, f);
    return `<div class="rcp-filterbar" data-list="${key}">
      <form class="rc-search rcp-filter-search" role="search" data-act-submit="filter-search" data-arg="${key}"><label class="rc-visually-hidden" for="${key}-q">${o.searchLabel}</label><input class="rc-input" id="${key}-q" name="q" type="search" value="${H.esc(f.q || "")}" placeholder="${o.searchLabel}" enterkeyhint="search">${H.btn({ label: "Search", variant: "secondary", type: "submit" })}</form>
      <div class="rcp-filter-buttons" role="group" aria-label="Filters">${o.menus.map((name) => menu(key, name, f, { scope: name === "kinds" && o.scope, label: o.labels && o.labels[name] })).join("")}${sortMenu(key, o.sorts, f)}</div>
      <div class="rcp-result-line">${chips.length ? `<div class="rcp-active-filters">${chips.join("")}${H.btn({ label: "Clear all", variant: "quiet", size: "sm", act: "clear-filters", arg: key })}</div>` : ""}<p class="rc-meta" role="status">${o.count === o.total ? `${o.total} ${o.noun}` : `${o.count} of ${o.total} ${o.noun}`}</p></div>
    </div>`;
  };
  const kindsOf = (x, where) => (where === "offer" ? x.offers || [] : where === "need" ? x.needs || [] : (x.needs || []).concat(x.offers || [])).flatMap((n) => n.capitals);
  const applyFilters = (ctx, items, f, text) => {
    let out = items.slice();
    if (f.q) out = out.filter((x) => text(x).toLowerCase().includes(f.q.toLowerCase()));
    if ((f.lenses || []).length) out = out.filter((x) => (x.lenses || []).some((l) => f.lenses.includes(l)));
    const kinds = [].concat(f.kinds || [], (f.match || []).filter((v) => v !== "offers" && v !== "needs"));
    if (kinds.length) out = out.filter((x) => kindsOf(x, f.kindIn).some((k) => kinds.includes(k)));
    const me = ctx.me;
    const myNeeds = me.needs.flatMap((n) => n.capitals);
    const myOffers = me.offers.flatMap((n) => n.capitals);
    if ((f.match || []).includes("offers")) out = out.filter((x) => kindsOf(x, "offer").some((k) => myNeeds.includes(k)));
    if ((f.match || []).includes("needs")) out = out.filter((x) => kindsOf(x, "need").some((k) => myOffers.includes(k)));
    if ((f.places || []).length) out = out.filter((x) => f.places.includes(x.country));
    if (f.closes) out = out.filter((x) => x.closesISO && H.daysLeft(x.closesISO) <= Number(f.closes));
    return out;
  };
  const noMatch = (key, what) => `<section class="rc-empty" aria-labelledby="${key}-none"><h2 id="${key}-none" class="rc-empty-title">No ${what} match these filters</h2><p>Try fewer words or fewer filters.</p>${H.btn({ label: "Clear all filters", variant: "primary", act: "clear-filters", arg: key })}</section>`;

  // ----- Cards. Fit sits at the same height on every card in a row: the title above it always takes two lines. -----
  H.partnerCard = (ctx, p) => {
    const s = ctx.s;
    const name = partnerName(ctx, p);
    if (s.dismissed[p.id]) return hidden(name, p.id);
    let actions;
    if (ctx.ui.dismissing === p.id) actions = dismissReasons(p.id, ["Too far away", "Not what we need", "Already in touch", "Another reason"]);
    else if (s.intros[p.id]) actions = `<p class="rc-save-status" data-state="account" role="status">${H.icon("done", "sm")}Introduction requested</p>`;
    else actions = `<div class="rc-action-bar">${H.btn({ label: "Ask for an introduction", variant: "secondary", size: "sm", act: "intro", arg: p.id })}${H.btn({ label: "Not a fit", variant: "quiet", size: "sm", act: "dismiss", arg: p.id })}</div>`;
    return `<article class="rc-card" data-stage="${p.stage}">${H.media(p.scene)}<header class="rc-card-header"><h3 class="rc-card-title rcp-clamp-2"><a href="#initiative" data-go="initiative" data-arg="${p.id}">${H.esc(name)}</a></h3></header><div class="rcp-fit-row">${H.fit(p.fit, null, p.reasons.map((r) => r.text).join(" "))}</div><p class="rc-card-meta"><span>${H.icon(p.place === "Several places" ? "globe" : "place", "sm")}${H.esc(p.place)}</span>${H.stage(p.stage)}</p>${H.reasons(p.reasons.slice(0, 2))}<div class="rcp-card-foot">${p.stale ? stamp(`Last confirmed ${p.stale}`, true) : ""}${actions}</div></article>`;
  };

  // What a fund asks from partners, and how much of it a team on the list could cover.
  const teamPick = (ctx, f) => (ctx.ui.team && ctx.ui.team[f.id]) || (f.asks || []).map((a) => (a.candidates[0] || {}).id).filter(Boolean);
  const teamCover = (f, pick) => (f.asks || []).filter((a) => a.candidates.some((c) => pick.includes(c.id))).length;
  const teamLine = (ctx, f) => {
    const asks = f.asks || [];
    if (!asks.length) return `<p class="rcp-team-line">${H.icon("check", "sm")}You can apply on your own</p>`;
    const coverable = asks.filter((a) => a.candidates.length).length;
    return `<p class="rcp-team-line">${H.icon("people", "sm")}Asks for ${asks.length} partner${asks.length === 1 ? "" : "s"}; ${coverable} could come from the list</p>`;
  };

  H.opportunityCard = (ctx, f, o = {}) => {
    const s = ctx.s;
    if (s.dismissed[f.id]) return hidden(f.funder, f.id);
    const ranked = s.hasDraft;
    let actions;
    if (ctx.ui.dismissing === f.id) actions = dismissReasons(f.id, ["Not eligible", "Too small", "Wrong timing", "Another reason"]);
    else if (s.reminders[f.id]) actions = `<p class="rc-save-status" data-state="account" role="status">${H.icon("done", "sm")}Reminder on: a week before it closes</p>`;
    else actions = `<div class="rc-action-bar">${H.btn({ label: "Remind me", variant: "secondary", size: "sm", act: "remind", arg: f.id })}${ranked && !o.compact ? H.btn({ label: "Not a fit", variant: "quiet", size: "sm", act: "dismiss", arg: f.id }) : ""}</div>`;
    const left = H.daysLeft(f.closesISO);
    const closes = o.soon ? `Closes in ${left} days` : `Closes ${shortDate(f.closesISO)}`;
    return `<article class="rc-card rcp-fund-card"><header class="rc-card-header"><p class="rcp-amount">${H.esc(f.amount)}<span class="rc-meta"> · ${closes}</span></p><h3 class="rc-card-title rcp-clamp-2"><a href="#opportunity" data-go="opportunity" data-arg="${f.id}">${H.esc(f.funder)}</a></h3></header>
      <div class="rcp-fit-row">${ranked ? H.fit(f.fit, null, f.reasons.map((r) => r.text).join(" ")) : `<span class="rc-meta">Describe your initiative to see how it fits</span>`}</div>
      ${ranked ? H.reasons(f.reasons.slice(0, 2)) : `<p class="rc-card-summary">${H.esc(f.eligibility[0])}</p>`}
      ${o.compact ? "" : teamLine(ctx, f)}
      <div class="rcp-card-foot">${o.compact ? "" : stamp(`Confirmed ${f.confirmed}`)}${actions}</div></article>`;
  };

  // Compact cards (Home) keep the picture, the type of work, the name and the place.
  H.dirCard = (ctx, d, o = {}) => {
    const name = ctx.state === "long" && d.longName ? d.longName : d.name;
    const needStates = {};
    const offerStates = {};
    (d.needs || []).forEach((n) => n.capitals.forEach((c) => (needStates[c] = "kept")));
    (d.offers || []).forEach((n) => n.capitals.forEach((c) => (offerStates[c] = "kept")));
    if (d.imported) {
      return `<article class="rc-card" data-pencil><header class="rc-card-header"><p class="rc-proposal-source">${H.icon("pencil-note", "sm")}Imported, not confirmed yet</p><h3 class="rc-card-title rcp-clamp-2"><a href="#initiative" data-go="initiative" data-arg="${d.id}">${H.esc(name)}</a></h3><p class="rc-card-meta"><span>${H.icon("place", "sm")}${H.esc(d.place)}</span>${H.stage(d.stage, { pencil: true })}</p></header><p class="rc-card-summary">${H.esc(d.description)}</p><div class="rcp-card-foot"><div class="rc-stamp"><span class="rc-time" data-stale>${H.icon("alert", "sm")}May be out of date</span>${H.btn({ label: "This is us", variant: "quiet", size: "sm", act: "claim", arg: d.id })}</div></div></article>`;
    }
    const head = `${H.media(d.scene)}<header class="rc-card-header"><h3 class="rc-card-title rcp-clamp-2"><a href="#initiative" data-go="initiative" data-arg="${d.id}">${H.esc(name)}</a></h3><p class="rc-card-meta"><span>${H.icon(d.place === "Several places" ? "globe" : "place", "sm")}${H.esc(d.place)}</span>${H.stage(d.stage)}</p></header>${d.stewardPick ? `<p class="rc-meta">${H.icon("done", "sm")} Steward pick</p>` : ""}${H.workTags(d.lenses)}`;
    if (o.compact) return `<article class="rc-card" data-stage="${d.stage}">${head}</article>`;
    return `<article class="rc-card" data-stage="${d.stage}">${head}<p class="rc-card-summary">${H.esc(ctx.state === "long" ? d.description + " " + D.meLong.description : d.description)}</p><div class="rcp-holdings-rows"><div class="rcp-holding"><span class="rc-meta">Needs</span>${H.tileList(needStates, "Needs by kind of support", { tip: "Needs" })}</div><div class="rcp-holding"><span class="rc-meta">Offers</span>${H.tileList(offerStates, "Offers by kind of support", { tip: "Offers" })}</div></div><div class="rcp-card-foot">${d.stale ? stamp(`Last confirmed ${d.stale}`, true) : stamp(`Confirmed ${d.confirmed}`)}</div></article>`;
  };

  // ----- The share card: partners are for initiatives on the list, so saving and sharing happen right here, in one place -----
  H.shareCard = (ctx, partners, o = {}) => {
    const s = ctx.s;
    const ui = ctx.ui;
    if (!s.hasDraft) {
      return `<article class="rc-card rcp-share-card" aria-labelledby="share-title"><header class="rc-card-header"><h2 class="rc-card-title" id="share-title">Partners come from your initiative</h2></header><p>Tell us what you do, need and offer. Then share it with the community to see who fits.</p><div class="rc-action-bar">${H.btn({ label: "Describe your initiative", variant: "primary", go: "step1" })}</div></article>`;
    }
    const n = partners.length;
    const wanting = partners.filter((p) => p.wantsYourOffer).length;
    const reasons = `<ul class="rc-reasons">${wanting ? `<li class="rc-reason">${H.icon("need", "sm")}${wanting === 1 ? "One needs" : `${wanting} need`} something you offer</li>` : ""}<li class="rc-reason">${H.icon("watershed", "sm")}One works in your basin</li><li class="rc-reason">${H.icon("offer", "sm")}Two offer something you need</li></ul>`;
    const head = `<header class="rc-card-header"><h2 class="rc-card-title" id="share-title">${n} initiative${n === 1 ? "" : "s"} match what you need and offer</h2></header>`;
    let body;
    if (!s.saved) {
      if (ui.shareStep === "code") {
        body = `<p>Enter the code to save your initiative and put it on the list.</p>${H.codePanel(ctx, { bare: true, mode: "code", value: ui.codeValue, error: ui.codeError, busy: ui.checking, resendIn: ui.resendIn, submitLabel: ui.shareIntent === "private" ? "Save privately" : "Save and share" })}`;
      } else {
        body = `<p>Share your initiative with the community to see who they are. They see you too, and anyone can get in touch.</p>
          <form class="rc-form rcp-signin" data-act-submit="send-code" data-arg="share">
            <div class="rcp-inline-field">${H.field({ id: "share-email", name: "email", label: "Email", type: "email", value: "", error: ui.emailError, required: true, attrs: 'autocomplete="email" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"' })}${H.btn({ label: ui.sending ? "Sending" : "Save and share", variant: "primary", type: "submit", busy: ui.sending, attrs: 'name="intent" value="share"' })}</div>
            <div class="rc-code-panel-actions"><button type="submit" class="rc-button" data-variant="quiet" data-size="sm" name="intent" value="private">Save privately instead</button>${H.btn({ label: "What we store", variant: "quiet", size: "sm", act: "open-privacy" })}</div>
          </form>
          <p class="rc-meta">Your email saves it, no password. Private initiatives see funding only.</p>`;
      }
    } else {
      body = `<p>Your initiative is private, so you see funding only. Share it with the community to see these partners and let them find you.</p><div class="rc-action-bar">${H.btn({ label: "Share with the community", variant: "primary", act: "open-share", arg: "community" })}</div><p class="rc-meta">You can make it private again any time in settings.</p>`;
    }
    return `<article class="rc-card rcp-share-card" aria-labelledby="share-title">${head}${reasons}${body}</article>`;
  };

  // ----- Finish -----
  Screens.finish = {
    title: "Finish: first matches",
    group: "Matches",
    nav: "partners",
    states: Object.assign({}, U, { saved: "Saved, private", shared: "Saved and shared" }),
    preset(s, fromList, st) { s.hasDraft = true; if (fromList) { s.saved = st === "saved" || st === "shared"; s.visibility = st === "shared" ? "community" : "private"; } },
    render(ctx) {
      const s = ctx.s;
      const st = ctx.state;
      const partners = partnersFor(ctx);
      const funds = fundsFor(ctx);
      let notices = ctx.ui.flash ? H.notice(ctx.ui.flash.tone, ctx.ui.flash.title, ctx.ui.flash.body, "", "status") : "";
      if (st === "offline") notices += H.offlineNotice("These matches were made on this device with the catalog saved in the app. Saving needs a connection.");
      if (st === "error") notices += H.notice("warning", "We could not load the latest funding catalog", "These matches use the copy from 28 October 2026. Your card is safe.", H.btn({ label: "Try again", variant: "secondary", size: "sm", act: "retry" }), "status");
      const loading = st === "loading";
      const fundingList = loading
        ? `<p class="rc-guide-status" aria-busy="true">${H.icon("device", "sm")}Comparing your card with 768 programs on this device</p>${H.skeletonList(2)}`
        : funds.length
          ? grid(funds.slice(0, 2), (f) => H.opportunityCard(ctx, f), "Funding that fits")
          : `<section class="rc-empty" aria-labelledby="nofunds"><h3 id="nofunds" class="rc-empty-title">No funding fits yet</h3><p>Nothing open matches right now. The catalog is checked every Thursday.</p>${H.btn({ label: "Email me when one fits", variant: "secondary", act: "remind", arg: "any" })}</section>`;
      const partnerBlock = loading
        ? `<p class="rc-guide-status" aria-busy="true">${H.icon("device", "sm")}Comparing with 7 initiatives</p>${H.skeletonList(1)}`
        : !partners.length
          ? `<section class="rc-empty" aria-labelledby="nopartners"><h3 id="nopartners" class="rc-empty-title">No partners fit yet</h3><p>When one does, it appears here.</p>${H.btn({ label: "Browse all initiatives", variant: "secondary", go: "directory" })}</section>`
          : H.canSeePartners(s)
            ? grid(partners.slice(0, 2), (p) => H.partnerCard(ctx, p), "Partners for you")
            : H.shareCard(ctx, partners);
      const body = `<div class="rc-step-layout"><div class="rc-step-main">
        <h1 class="rc-heading" data-size="page">Your first matches</h1>
        ${notices}
        <section class="rc-card-list" aria-labelledby="fin-funding"><header class="rc-card-list-header"><h2 id="fin-funding" class="rc-heading" data-size="section">Funding that fits</h2>${funds.length > 2 ? `<a class="rc-button" data-variant="quiet" data-size="sm" href="#opportunities" data-go="opportunities">See all ${funds.length}</a>` : ""}</header>${fundingList}</section>
        <section class="rc-card-list" aria-labelledby="fin-partners"><header class="rc-card-list-header"><h2 id="fin-partners" class="rc-heading" data-size="section">Partners</h2>${H.canSeePartners(s) && partners.length > 2 ? `<a class="rc-button" data-variant="quiet" data-size="sm" href="#partners-after" data-go="partners-after">See all ${partners.length}</a>` : ""}</header>${partnerBlock}</section>
      </div>
      <aside class="rc-step-aside" aria-labelledby="yourcard"><h2 class="rcp-preview-label" id="yourcard">Your card</h2>${H.myCard(ctx, { offers: "show", actions: `<div class="rc-action-bar">${H.btn({ label: "Change your card", variant: "quiet", size: "sm", go: "card" })}${H.btn({ label: "Copy as text", variant: "quiet", size: "sm", act: "copy-card" })}</div>` })}</aside></div>`;
      return H.shell(ctx, { nav: "partners", body });
    },
  };

  // ----- Sheets and pop-ups -----
  const closeButton = `<button class="rc-icon-button" type="button" data-act="close-sheet" aria-label="Close">${H.icon("close")}</button>`;
  const sheetHead = (title) => `<div class="rcp-sheet-grabber" aria-hidden="true" data-grabber></div><div class="rcp-sheet-head"><h2 id="proto-dialog-title" class="rc-dialog-title">${title}</h2>${closeButton}</div>`;
  // One door: anything that needs an email saves the initiative to that email.
  const SIGNIN_COPY = {
    save: ["Save your initiative", "Your email keeps it safe and opens it on any device. No password."],
    signin: ["Sign in", "We email you a code. If you saved before, it signs you in."],
    remind: ["Save your initiative to get reminders", "Reminders come by email, so this saves your initiative to your email too."],
    share: ["Save and share your initiative", "Your email saves it. Sharing puts it on the list, so partners can see you and you can see them."],
    intro: ["Save and share to ask for introductions", "Introductions are between initiatives on the list. Your email saves yours and puts it there."],
    claim: ["Confirm it is yours", "We email you a code to confirm this record."],
  };
  H.signinSheet = (ctx, sh, st) => {
    const s = ctx.s;
    const kind = (sh.resume || "save").split(":")[0];
    const [title, intro] = SIGNIN_COPY[kind] || SIGNIN_COPY.save;
    if (sh.step === "email") {
      let notice = "";
      if (st === "offline") notice = H.notice("warning", "You are offline", "Your work is saved on this device. We send the code when you reconnect.", "", "status");
      if (st === "limited") notice = H.notice("danger", "We have sent a few codes already", "Try again in 10 minutes. Your work is still here.", "", "alert");
      if (st === "failed" || st === "error") notice = H.notice("danger", "We could not send your code", "Your work is still here. Try again in a minute.", "", "alert");
      const email = st === "empty" ? "" : st === "long" ? "ana.beatriz.ferreira.dos.santos.guardias@nascentesdoaltoriodasalmas.org.br" : st === "invalid" ? "ana@example" : s.email;
      const panel = H.codePanel(ctx, { bare: true, id: "sheet", intro, email, error: st === "invalid" ? "That email looks incomplete. Check the part after the @." : ctx.ui.emailError, busy: st === "loading" || ctx.ui.sending, notice, resume: sh.resume, disabled: st === "limited", autofocus: true });
      return `<div class="rc-dialog-body">${sheetHead(title)}${panel}${s.hasDraft ? `<p class="rc-save-status" data-state="device">${H.icon("device", "sm")}Saved on this device until then.</p>` : ""}</div>`;
    }
    if (st === "long") s.email = "ana.beatriz.ferreira.dos.santos.guardias@nascentesdoaltoriodasalmas.org.br";
    else if (s.email.length > 40) s.email = "ana@example.org";
    let notice = "";
    let error = ctx.ui.codeError || "";
    let value = ctx.ui.codeValue || "";
    let help = "";
    if (st === "wrong") { error = "That code does not match. Check it, or send a new one."; value = "48213"; }
    if (st === "expired") { error = "That code has expired. We can send a new one."; value = "482139"; }
    if (st === "failed") notice = H.notice("danger", "We could not check your code", "Our side did not answer. Your work is still here. Try again in a minute.", "", "alert");
    if (st === "limited") notice = H.notice("danger", "We have sent a few codes already", "Try again in 10 minutes. Your work is still here.", "", "alert");
    if (st === "offline") notice = H.notice("warning", "You are offline", "Your work is saved on this device. We try when you reconnect.", "", "status");
    if (st === "storage") notice = H.notice("danger", "Your browser did not keep your draft", "It cleared this site's storage, so the draft on this device is gone. Anything saved before is safe once you sign in.", "", "alert");
    if (st === "never") help = H.notice("info", "Still nothing after a few minutes?", "Send a new code or check the address. If it never arrives, write to us through the Regen Commons website and a person will help.", "", "status");
    const known = st === "known";
    const resendIn = st === "default" || known || st === "loading" ? ctx.ui.resendIn : 0;
    const panel = H.codePanel(ctx, { bare: true, mode: "code", value, error, notice, help, busy: st === "loading" || ctx.ui.checking, resendIn, disabled: st === "limited", submitLabel: known || kind === "signin" ? "Sign in" : kind === "share" || kind === "intro" ? "Save and share" : "Save", autofocus: true });
    return `<div class="rc-dialog-body">${sheetHead(known ? "Sign in" : "Enter your code")}${known ? `<p>This email saved before, so the code signs you in.${s.hasDraft ? " Your draft comes with you." : ""}</p>` : ""}${panel}<p class="rc-save-status" data-state="device">${H.icon("device", "sm")}${st === "storage" ? "Nothing is kept on this device right now." : "This page keeps your place."}</p></div>`;
  };

  // Two ways to be on Weave: private, for finding funding, or shared with the community, which opens partners.
  H.shareSheet = (ctx, sh, st) => {
    const s = ctx.s;
    const v = ctx.ui.pendingVisibility || sh.preset || s.visibility;
    let notice = "";
    if (st === "offline") notice = H.offlineNotice("Your choice is kept on this device and sent when you reconnect.");
    if (st === "error") notice = H.notice("danger", "We could not save this choice", "It is still private. Try again in a minute.", "", "alert");
    const choice = (value, icon, title, note) => `<label class="rc-choice"><input class="rc-check" type="radio" name="visibility" value="${value}"${v === value ? " checked" : ""}><span class="rc-choice-text"><span class="rc-choice-title">${H.icon(icon, "sm")}${title}</span><span class="rc-choice-note">${note}</span></span></label>`;
    const onward = v === "community" ? `<label class="rc-choice"><input class="rc-switch" type="checkbox" role="switch" name="murmurations"><span class="rc-choice-text"><span class="rc-choice-title">Also list it on other open directories</span><span class="rc-choice-note">Off. Directories such as Murmurations could show your public card.</span></span></label>` : "";
    return `<form class="rc-dialog-body" data-act-submit="share-save">${sheetHead(sh.justSaved ? "Saved. Who can see it?" : "Who can see your initiative?")}
      ${sh.justSaved ? `<p class="rc-save-status" data-state="account" role="status">${H.icon("done", "sm")}Saved as ${H.esc(s.email)}</p>` : ""}
      ${notice}
      <fieldset class="rc-choice-group"><legend class="rc-visually-hidden">Choose one</legend>
        ${choice("private", "lock", "Private, for finding funding", "Only you see it. You see funding matches only.")}
        ${choice("community", "globe", "Shared with the community", "A public page and a place in the directory. You see partner matches, and anyone can get in touch.")}
      </fieldset>
      ${onward}
      <div class="rc-action-bar">${H.btn({ label: st === "loading" ? "Saving" : "Save this choice", variant: "primary", type: "submit", busy: st === "loading" })}${H.btn({ label: "Not now", variant: "quiet", act: "close-sheet" })}</div>
    </form>`;
  };

  H.introDialog = (ctx, ps, note) => {
    const names = ps.map((p) => H.esc(partnerName(ctx, p)));
    return `<form class="rc-dialog-body" method="dialog">
    <div class="rcp-sheet-grabber" aria-hidden="true" data-grabber></div>
    <h2 id="proto-dialog-title" class="rc-dialog-title">${ps.length === 1 ? `Ask ${names[0]} for an introduction?` : `Ask ${ps.length} partners for introductions?`}</h2>
    ${ps.length > 1 ? `<ul class="rc-reasons">${names.map((n) => `<li class="rc-reason">${H.icon("people", "sm")}${n}</li>`).join("")}</ul>` : ""}
    ${note ? `<p>${H.esc(note)}</p>` : ""}
    <dl class="rc-facts">
      <div><dt>What they see</dt><dd>Your card and the line below.</dd></div>
      <div><dt>What happens next</dt><dd>If they accept, you both get each other's email. If not, nothing more is shared.</dd></div>
    </dl>
    ${H.field({ id: "intro-note", label: "A line in your own words", hint: "Optional. Why them, why now.", kind: "textarea", rows: 2, value: "" })}
    <div class="rc-action-bar">${H.btn({ label: ps.length === 1 ? "Send the request" : `Send ${ps.length} requests`, variant: "primary", type: "submit" })}<button class="rc-button" data-variant="quiet" value="no" formnovalidate>Not now</button></div>
  </form>`;
  };

  H.deleteDialog = () => `<form class="rc-dialog-body" method="dialog">
    <div class="rcp-sheet-grabber" aria-hidden="true" data-grabber></div>
    <h2 id="proto-dialog-title" class="rc-dialog-title">Delete your account?</h2>
    <p>Your initiatives are deleted. Anything shared is withdrawn, here and from other directories. This cannot be undone.</p>
    <div class="rc-action-bar"><button class="rc-button" data-variant="danger" value="yes">Delete everything</button><button class="rc-button" data-variant="quiet" value="no" formnovalidate>Keep my account</button></div>
  </form>`;

  // What we store: five short answers, in a pop-up over the page.
  H.privacyDialog = (ctx, st) => `<div class="rc-dialog-body">${sheetHead("What we store")}
    ${st === "offline" ? H.offlineNotice("This is saved with the app, so it is complete offline.") : ""}
    <dl class="rc-facts rcp-facts-short">
      <div><dt>${H.icon("device", "sm")} Your draft</dt><dd>In this browser only, until you save it.</dd></div>
      <div><dt>${H.icon("mail", "sm")} When you save</dt><dd>A copy on Regen Commons servers, linked to your email.</dd></div>
      <div><dt>${H.icon("lock", "sm")} Private or shared</dt><dd>Private: only you. Shared: anyone can see it.</dd></div>
      <div><dt>${H.icon("mic", "sm")} Your words</dt><dd>Read on your device. The cloud only when you choose.</dd></div>
      <div><dt>${H.icon("close", "sm")} Leaving</dt><dd>Export or delete everything, any time.</dd></div>
    </dl>
    ${st === "long" ? `<p class="rc-meta">${H.esc(D.meLong.description)}</p>` : ""}
    <div class="rc-action-bar"><a class="rc-button" data-variant="quiet" data-size="sm" href="https://regencommons.com" rel="noopener">The full data policy</a>${H.btn({ label: "Close", variant: "secondary", size: "sm", act: "close-sheet" })}</div></div>`;

  // What the assistant did: one line of summary, then one row per step, never the text.
  H.ledgerDialog = (ctx, st) => {
    const rows = st === "empty" ? [] : st === "long" ? D.ledger.concat(D.ledger, D.ledger) : D.ledger;
    const cloud = rows.filter((r) => r.words > 0).length;
    const withdrawn = st === "withdrawn" || ctx.s.cloudConsent === "withdrawn";
    const list = st === "loading"
      ? H.skeletonList(1)
      : rows.length
        ? `<ol class="rcp-ledger">${rows.map((r) => `<li class="rcp-ledger-row"><span class="rcp-ledger-icon">${H.icon(r.words > 0 ? "globe" : "device", "sm")}</span><span class="rcp-ledger-text"><span class="rcp-ledger-what">${H.esc(r.what)}</span><span class="rc-meta">${H.esc(r.when)} · ${r.words > 0 ? `${r.words} words sent to the cloud` : "On this device, nothing sent"}</span></span></li>`).join("")}</ol>`
        : `<p class="rc-meta">Nothing has run yet. Each time the assistant reads something, it shows here.</p>`;
    return `<div class="rc-dialog-body">${sheetHead("What the assistant did")}
      ${withdrawn ? H.notice("success", "Cloud consent withdrawn", "The assistant runs on this device only.", "", "status") : ""}
      ${rows.length ? `<p>${rows.length} step${rows.length === 1 ? "" : "s"}: ${rows.length - cloud} on this device, ${cloud} in the cloud with your consent. Never your text.</p>` : ""}
      ${list}
      <div class="rc-action-bar">${H.btn({ label: "Export as a file", variant: "secondary", size: "sm", act: "export-ledger" })}${ctx.s.cloudConsent !== "none" && !withdrawn ? H.btn({ label: "Withdraw cloud consent", variant: "quiet", size: "sm", act: "withdraw-consent" }) : ""}</div></div>`;
  };

  // A sheet screen draws the page underneath in its default state, then opens the sheet in the chosen state.
  const under = (ctx, id) => Screens[id].render(Object.assign({}, ctx, { state: "default" }));
  const baseFor = (s) => (s.hasDraft ? "finish" : "home");

  // ----- Partners: only for initiatives on the list -----
  const PARTNER_SORTS = [["fit", "Best fit"], ["near", "Closest"], ["new", "Newest"]];
  Screens["partners-before"] = {
    title: "Partners, before sharing",
    group: "Matches",
    nav: "partners",
    states: { default: "Draft, not saved", private: "Saved, private", visitor: "No initiative yet", code: "Saving: code step", empty: "Empty", loading: "Loading", offline: "Offline", error: "Error", long: "Very long content" },
    preset(s, fromList, st) { if (!fromList) return; s.hasDraft = st !== "visitor"; s.saved = st === "private"; s.visibility = "private"; },
    render(ctx) {
      const st = ctx.state;
      if (st === "code") { ctx.ui.shareStep = "code"; ctx.ui.resendIn = ctx.ui.resendIn == null ? 60 : ctx.ui.resendIn; }
      const partners = partnersFor(ctx);
      let notices = ctx.ui.flash ? H.notice(ctx.ui.flash.tone, ctx.ui.flash.title, ctx.ui.flash.body, "", "status") : "";
      if (st === "offline") notices += H.offlineNotice("Matched on this device with the list from your last visit. Saving and sharing need a connection.");
      if (st === "error") notices += H.notice("danger", "We could not load the list of initiatives", "Your card is safe. Try again in a minute.", H.btn({ label: "Try again", variant: "secondary", size: "sm", act: "retry" }), "alert");
      const content = st === "loading"
        ? H.skeletonList(1)
        : partners.length || !ctx.s.hasDraft
          ? H.shareCard(ctx, partners)
          : `<section class="rc-empty" aria-labelledby="none"><h2 id="none" class="rc-empty-title">No partners fit yet</h2><p>When one does, it shows here once you share.</p>${H.btn({ label: "Browse all initiatives", variant: "primary", go: "directory" })}</section>`;
      const body = `<div class="rcp-centered">
        <h1 class="rc-heading" data-size="page">Partners for you</h1>
        ${notices}
        ${content}
      </div>`;
      return H.shell(ctx, { nav: "partners", body });
    },
  };
  Screens["partners-after"] = {
    title: "Partners, shared with the community",
    group: "Matches",
    nav: "partners",
    states: Object.assign({}, U, { intro: "Asking for an introduction", dismissing: "Saying not a fit", filtered: "Filtered" }),
    preset(s) { s.hasDraft = true; s.saved = true; s.visibility = "community"; },
    dialog(ctx) { return ctx.state === "intro" ? { kind: "intro", ids: ["p1"] } : null; },
    render(ctx) {
      const st = ctx.state;
      if (st === "dismissing") ctx.ui.dismissing = ctx.ui.dismissing || "p2";
      if (st === "filtered") ctx.ui.filters = Object.assign({}, ctx.ui.filters, { partners: { lenses: ["Research"], match: ["offers"] } });
      const partners = partnersFor(ctx);
      let notices = ctx.ui.flash ? H.notice(ctx.ui.flash.tone, ctx.ui.flash.title, ctx.ui.flash.body, "", "status") : "";
      if (st === "offline") notices += H.offlineNotice("Matched on this device with the list from your last visit, 31 October 2026.");
      if (st === "error") notices += H.notice("danger", "We could not load the list of initiatives", "Your card is safe. Try again in a minute.", H.btn({ label: "Try again", variant: "secondary", size: "sm", act: "retry" }), "alert");
      let content;
      if (st === "loading") content = `<p class="rc-guide-status" aria-busy="true">${H.icon("device", "sm")}Comparing your needs and offers with 7 initiatives, on this device</p>${H.skeletonList(3, true)}`;
      else if (!partners.length) content = `<section class="rc-empty" aria-labelledby="none"><h2 id="none" class="rc-empty-title">No partners fit yet</h2><p>None of the 7 initiatives fit what you need. When one does, it shows here.</p>${H.btn({ label: "Email me when one appears", variant: "primary", act: "remind", arg: "partners" })}</section>`;
      else {
        const f = filtersFor(ctx, "partners");
        const list = applyFilters(ctx, partners, f, (p) => `${p.name} ${p.place} ${p.description}`);
        content = `${H.filterBar(ctx, "partners", { searchLabel: "Search partners", menus: ["lenses", "match", "places"], sorts: PARTNER_SORTS, count: list.length, total: partners.length, noun: "partners" })}${list.length ? grid(list, (p) => H.partnerCard(ctx, p), "Partners") : noMatch("partners", "partners")}`;
      }
      const body = `<div class="rc-list-layout">
        <h1 class="rc-heading" data-size="page">Partners for you</h1>
        ${notices}
        ${content}
      </div>`;
      return H.shell(ctx, { nav: "partners", body });
    },
  };

  // ----- Funding -----
  const FUND_SORTS = [["fit", "Best fit"], ["closing", "Closing soon"], ["new", "Newest"]];
  const VISITOR_SORTS = [["closing", "Closing soon"], ["new", "Newest"]];
  Screens.opportunities = {
    title: "Funding",
    group: "Matches",
    nav: "funding",
    states: Object.assign({}, U, { visitor: "Visitor with no initiative yet", filtered: "Filtered" }),
    render(ctx) {
      const s = ctx.s;
      const st = ctx.state;
      if (st === "visitor") s.hasDraft = false;
      if (st === "filtered") ctx.ui.filters = Object.assign({}, ctx.ui.filters, { funding: { closes: "90" } });
      const funds = fundsFor(ctx);
      let notices = ctx.ui.flash ? H.notice(ctx.ui.flash.tone, ctx.ui.flash.title, ctx.ui.flash.body, "", "status") : "";
      if (!s.hasDraft) notices += H.notice("info", "Describe your initiative to see what fits", "Until then this is the full list. Check eligibility with the funder before you apply.", H.btn({ label: "Describe your initiative", variant: "primary", size: "sm", go: "step1" }));
      if (st === "offline") notices += H.offlineNotice("Showing the catalog saved with the app on 28 October 2026.");
      if (st === "error") notices += H.notice("danger", "We could not load the funding catalog", "Try again in a minute. Your card is safe.", H.btn({ label: "Try again", variant: "secondary", size: "sm", act: "retry" }), "alert");
      let list;
      if (st === "loading") list = `<p class="rc-guide-status" aria-busy="true">${H.icon("device", "sm")}Comparing your card with 768 programs on this device</p>${H.skeletonList(3)}`;
      else if (!funds.length) list = `<section class="rc-empty" aria-labelledby="none"><h2 id="none" class="rc-empty-title">No funding fits yet</h2><p>Nothing open matches right now. The catalog is checked every Thursday.</p>${H.btn({ label: "Email me when one fits", variant: "primary", act: "remind", arg: "any" })}</section>`;
      else {
        const f = filtersFor(ctx, "funding");
        let shown = applyFilters(ctx, funds, f, (x) => `${x.title} ${x.funder} ${x.eligibility.join(" ")}`);
        const sort = f.sort || (s.hasDraft ? "fit" : "closing");
        if (sort === "closing") shown = shown.slice().sort((a, b) => a.closesISO.localeCompare(b.closesISO));
        list = `${H.filterBar(ctx, "funding", { searchLabel: "Search funding", menus: ["closes"], sorts: s.hasDraft ? FUND_SORTS : VISITOR_SORTS, count: shown.length, total: funds.length, noun: "programs" })}${shown.length ? grid(shown, (x) => H.opportunityCard(ctx, x), "Funding") : noMatch("funding", "programs")}`;
      }
      const body = `<div class="rc-list-layout">
        <h1 class="rc-heading" data-size="page">${s.hasDraft ? "Funding that fits" : "Funding"}</h1>
        ${notices}
        ${list}
      </div>`;
      return H.shell(ctx, { nav: "funding", body });
    },
  };

  // ----- Opportunity detail: why it fits, and the team it asks for -----
  H.teamSlots = (ctx, f) => {
    const asks = f.asks || [];
    if (!asks.length) return `<p>${H.icon("check", "sm")} You can apply on your own. This fund asks for no partner.</p>`;
    const see = H.canSeePartners(ctx.s);
    const pick = teamPick(ctx, f);
    const slots = asks.map((a, i) => {
      let who;
      if (!a.candidates.length) who = `<p class="rc-meta">Nobody on the list yet. We tell you when someone joins.</p>`;
      else if (!see) who = `<p class="rc-meta">${H.icon("lock", "sm")} ${a.candidates.length} on the list could do this</p>`;
      else who = `<ul class="rcp-slot-candidates">${a.candidates.map((c) => { const p = findInit(c.id); return `<li><label class="rcp-candidate"><input class="rc-check" type="checkbox" name="team" value="${c.id}" data-fund="${f.id}"${pick.includes(c.id) ? " checked" : ""}><span class="rcp-candidate-text"><span class="rcp-candidate-name">${H.esc(partnerName(ctx, p))}</span><span class="rc-meta">${H.esc(c.why)}</span></span></label></li>`; }).join("")}</ul>`;
      return `<li class="rcp-slot"><p class="rcp-slot-ask"><span class="rcp-slot-n" aria-hidden="true">${i + 1}</span>${H.esc(a.label)}</p>${who}</li>`;
    }).join("");
    const covered = teamCover(f, pick);
    const level = covered === asks.length ? "strong" : covered ? "good" : "possible";
    const chosen = pick.filter((id) => !ctx.s.intros[id]);
    const tail = see
      ? `<div class="rcp-team-fit">${H.fit(level, `Team fit: ${{ strong: "strong", good: "good", possible: "possible" }[level]}`, `${covered} of ${asks.length} asks covered by the partners you picked`)}</div><div class="rc-action-bar">${chosen.length ? H.btn({ label: chosen.length === 1 ? "Ask 1 for an introduction" : `Ask ${chosen.length} for introductions`, variant: "primary", act: "team-intro", arg: f.id }) : `<p class="rc-meta">${pick.length ? "Introductions requested for everyone picked." : "Pick partners to ask them together."}</p>`}</div>`
      : `<div class="rc-action-bar">${H.btn({ label: "Share to see who they are", variant: "secondary", act: "share-for-partners" })}</div><p class="rc-meta">Partners are for initiatives on the list. Private initiatives see funding only.</p>`;
    return `<ol class="rcp-slots">${slots}</ol>${tail}`;
  };

  Screens.opportunity = {
    title: "Opportunity detail, with a team",
    group: "Matches",
    nav: "funding",
    states: Object.assign({}, U, { private: "Private initiative: names hidden", nogap: "Nobody closes a gap yet", alone: "Apply on your own" }),
    preset(s, fromList, st) { s.hasDraft = true; if (fromList) { s.saved = true; s.visibility = st === "private" ? "private" : "community"; } },
    render(ctx) {
      const s = ctx.s;
      const st = ctx.state;
      let f = D.opportunities.find((x) => x.id === ctx.ui.opportunity) || D.opportunities[0];
      if (st === "nogap") f = D.opportunities[2];
      if (st === "alone" || st === "empty") f = D.opportunities[3];
      if (st === "long") f = Object.assign({}, f, { title: f.title + ", second call for community-led watershed restoration in the Cerrado and adjoining biomes", eligibility: f.eligibility.concat(["Applicants must show letters of support from the municipal water committee and at least two neighbouring landholders.", "Budgets must separate fencing, planting, monitoring and community time, each with a quote.", "Reports are due every six months in Portuguese or English."]) });
      let notices = ctx.ui.flash ? H.notice(ctx.ui.flash.tone, ctx.ui.flash.title, ctx.ui.flash.body, "", "status") : "";
      if (st === "offline") notices += H.offlineNotice("Showing the copy from 28 October 2026. The funder's page needs a connection.");
      if (st === "error") notices += H.notice("warning", "The funder's page did not answer", "What we know is below, confirmed " + f.confirmed + ".", "", "status");
      const remind = s.reminders[f.id] ? `<p class="rc-save-status" data-state="account" role="status">${H.icon("done", "sm")}Reminder on: a week before it closes</p>` : `<div class="rc-action-bar">${H.btn({ label: "Remind me before it closes", variant: "secondary", act: "remind", arg: f.id })}${H.btn({ label: "Not a fit", variant: "quiet", act: "dismiss", arg: f.id })}</div>`;
      const body = `<div class="rc-list-layout">
        <p><a href="#opportunities" data-go="opportunities">${H.icon("back", "sm")} Funding</a></p>
        <div class="rcp-detail">
          <div class="rcp-detail-main">
            <header class="rc-card-header"><p class="rcp-amount">${H.esc(f.amount)}<span class="rc-meta"> · Closes ${H.esc(f.closes)}</span></p><h1 class="rc-heading" data-size="page">${H.esc(f.title)}</h1><p class="rc-card-meta"><span>${H.esc(f.route)}</span></p></header>
            ${notices}
            <section class="rc-stack" aria-labelledby="why"><h2 id="why" class="rc-heading" data-size="section">Why it fits</h2>${H.reasons(f.reasons)}${H.fit(f.fit, { strong: "Strong fit on your own", good: "Good fit on your own", possible: "Possible fit on your own" }[f.fit], f.reasons.map((r) => r.text).join(" "))}</section>
            <section class="rc-stack" aria-labelledby="before"><h2 id="before" class="rc-heading" data-size="section">Before you apply</h2><dl class="rc-facts"><div><dt>Who can apply</dt><dd><ul class="rc-reasons">${f.eligibility.map((e) => `<li class="rc-reason">${H.icon("info", "sm")}${H.esc(e)}</li>`).join("")}</ul></dd></div><div><dt>Award</dt><dd>${H.esc(f.amount)}</dd></div></dl><p class="rc-meta">Fit is not eligibility. Check with the funder.</p>${stamp(`Confirmed ${f.confirmed}`, false, `<a class="rc-button" data-variant="quiet" data-size="sm" href="https://example.org" rel="noopener">Open the funder's page</a>`)}</section>
          </div>
          <aside class="rc-stack" aria-labelledby="team">
            <h2 id="team" class="rc-heading" data-size="section">Stronger with a team</h2>
            <p class="rc-meta">What ${H.esc(f.funder)} asks for that partners could bring.</p>
            ${st === "loading" ? H.skeletonList(1) : H.teamSlots(ctx, f)}
            ${remind}
            ${ctx.ui.dismissing === f.id ? dismissReasons(f.id, ["Not eligible", "Too small", "Wrong timing", "Another reason"]) : ""}
          </aside>
        </div>
      </div>`;
      return H.shell(ctx, { nav: "funding", body });
    },
  };

  // ----- Sign-in sheets: email, code, saved -----
  Screens.email = {
    title: "Sign-in sheet: email",
    group: "Save",
    states: Object.assign({}, U, { invalid: "Error: email looks incomplete", limited: "Error: rate limited", failed: "Error: could not send" }),
    preset(s, fromList) { if (fromList) s.saved = false; },
    base: (s) => baseFor(s),
    dialog(ctx) { return { kind: "signin", step: "email", resume: ctx.ui.resume || (ctx.s.hasDraft ? "save" : "signin") }; },
    render(ctx) { return under(ctx, baseFor(ctx.s)); },
  };
  Screens.code = {
    title: "Sign-in sheet: code",
    group: "Save",
    states: { default: "Waiting for the code", loading: "Checking the code", wrong: "Error: wrong code", expired: "Error: expired code", limited: "Error: rate limited", offline: "Offline", storage: "Error: browser storage blocked or evicted", never: "Email never arrives", known: "Email already known, signing in", failed: "Error: could not check", long: "Very long content", empty: "Empty" },
    preset(s, fromList) { s.hasDraft = true; if (fromList) s.saved = false; },
    base: () => "finish",
    dialog(ctx) { return { kind: "signin", step: "code", resume: ctx.ui.resume || "save" }; },
    render(ctx) { return under(ctx, "finish"); },
  };
  Screens.saved = {
    title: "Saved: private or shared",
    group: "Save",
    nav: "partners",
    states: Object.assign({}, U),
    preset(s, fromList) { s.hasDraft = true; s.saved = true; if (fromList) s.visibility = "private"; },
    base: () => "finish",
    dialog(ctx) { return { kind: "share", justSaved: true }; },
    render(ctx) { return under(ctx, "finish"); },
  };
  Screens.share = {
    title: "Share sheet: private or shared",
    group: "Save",
    nav: "partners",
    states: { default: "Sheet open", community: "Shared with the community chosen", loading: "Saving", offline: "Offline", error: "Error" },
    preset(s) { s.hasDraft = true; s.saved = true; },
    base: () => "finish",
    dialog(ctx) { return { kind: "share", preset: ctx.state === "community" ? "community" : undefined }; },
    render(ctx) { return under(ctx, "finish"); },
  };

  Screens.merge = {
    title: "Signed in with a draft and a saved initiative",
    group: "Save",
    states: Object.assign({}, U),
    preset(s) { s.hasDraft = true; s.saved = true; },
    render(ctx) {
      const st = ctx.state;
      const me = ctx.me;
      let extra = "";
      if (st === "offline") extra = H.offlineNotice("We compare the two when you reconnect. Your draft is safe on this device.");
      if (st === "error") extra = H.notice("danger", "We could not load your saved initiative", "Your draft is safe on this device. Try again in a minute.", "", "alert");
      if (st === "empty") {
        const body = `<div class="rc-narrow">${H.notice("success", "Welcome back", "Nothing was waiting on this device, so here is your saved initiative.", "", "status")}<h1 class="rc-heading" data-size="page">${H.esc(me.name)}</h1>${H.myCard(ctx, { offers: "show" })}<div class="rc-action-bar">${H.btn({ label: "See my matches", variant: "primary", go: "finish" })}</div></div>`;
        return H.shell(ctx, { nav: "partners", body });
      }
      const two = st === "loading"
        ? H.skeletonList(2)
        : `<ul class="rcp-card-grid"><li style="--i:0"><article class="rc-card" data-stage="${me.derived.stage}"><header class="rc-card-header"><h2 class="rc-card-title">${H.esc(me.name)}</h2><p class="rc-card-meta"><span>${H.icon("device", "sm")}On this device, edited today</span><span>3 needs, 4 offers</span></p></header></article></li><li style="--i:1"><article class="rc-card" data-stage="sprout"><header class="rc-card-header"><h2 class="rc-card-title">Guardiãs das Nascentes</h2><p class="rc-card-meta"><span>${H.icon("lock", "sm")}Saved 28 October 2026, private</span><span>2 needs, 1 offer</span></p></header></article></li></ul>`;
      const body = `<div class="rc-narrow">${extra}
        <h1 class="rc-heading" data-size="page">Two versions of your initiative</h1>
        <p>A draft on this device and one saved with <strong>${H.esc(ctx.s.email)}</strong>. Nothing is replaced until you choose.</p>
        ${two}
        <form class="rc-form" data-act-submit="merge"><fieldset class="rc-choice-group"><legend>What would you like to do?</legend>
          <label class="rc-choice"><input class="rc-check" type="radio" name="merge" value="both" checked><span class="rc-choice-text"><span class="rc-choice-title">Keep both</span><span class="rc-choice-note">One email can hold several initiatives.</span></span></label>
          <label class="rc-choice"><input class="rc-check" type="radio" name="merge" value="replace"><span class="rc-choice-text"><span class="rc-choice-title">Replace the saved one with this draft</span><span class="rc-choice-note">The saved version stays in its history.</span></span></label>
          <label class="rc-choice"><input class="rc-check" type="radio" name="merge" value="discard"><span class="rc-choice-text"><span class="rc-choice-title">Keep the saved one</span><span class="rc-choice-note">The draft on this device is deleted.</span></span></label>
        </fieldset><div class="rc-action-bar">${H.btn({ label: st === "loading" ? "Loading" : "Continue", variant: "primary", type: "submit", busy: st === "loading" })}</div></form>
      </div>`;
      return H.shell(ctx, { form: true, body });
    },
  };

  // ----- Directory -----
  const DIR_SORTS = [["new", "Newest"], ["az", "A to Z"], ["stage", "Longest established"]];
  Screens.directory = {
    title: "Public directory",
    group: "Browse",
    nav: "directory",
    states: Object.assign({}, U, { filtered: "Filtered" }),
    render(ctx) {
      const st = ctx.state;
      if (st === "filtered") ctx.ui.filters = Object.assign({}, ctx.ui.filters, { directory: { lenses: ["Research"], kinds: ["intellectual"], kindIn: "offer" } });
      if (st === "empty") ctx.ui.filters = Object.assign({}, ctx.ui.filters, { directory: { q: "mangrove kites" } });
      const f = filtersFor(ctx, "directory");
      const all = st === "long" ? D.directory.concat(D.directory.map((d) => Object.assign({}, d, { id: d.id + "b" }))) : D.directory;
      let items = applyFilters(ctx, all, f, (d) => `${d.name} ${d.place} ${d.description}`);
      if (f.sort === "az") items = items.slice().sort((a, b) => a.name.localeCompare(b.name));
      if (f.sort === "stage") { const o = { tree: 0, flowering: 1, sprout: 2, seed: 3 }; items = items.slice().sort((a, b) => o[a.stage] - o[b.stage]); }
      let notices = "";
      if (st === "offline") notices = H.offlineNotice("Showing the list saved on this device, 31 October 2026.");
      if (st === "error") notices = H.notice("danger", "We could not load the list", "Try again in a minute.", H.btn({ label: "Try again", variant: "secondary", size: "sm", act: "retry" }), "alert");
      const bar = H.filterBar(ctx, "directory", { searchLabel: "Search initiatives", menus: ["lenses", "kinds", "places"], scope: true, sorts: DIR_SORTS, count: items.length, total: all.length, noun: "initiatives" });
      let list;
      if (st === "loading") list = H.skeletonList(6, true);
      else if (!items.length) list = noMatch("directory", "initiatives");
      else list = grid(items, (d) => H.dirCard(ctx, d), "Initiatives");
      const body = `<div class="rc-list-layout">
        <h1 class="rc-heading" data-size="page">Initiatives</h1>
        <p class="rc-meta">Shared with the community. Private initiatives never appear here.</p>
        ${notices}
        ${bar}
        ${list}
      </div>`;
      return H.shell(ctx, { nav: "directory", body });
    },
  };

  Screens.initiative = {
    title: "Public initiative page",
    group: "Browse",
    nav: "directory",
    states: Object.assign({}, U, { private: "Viewer's initiative is private" }),
    preset(s, fromList, st) { if (fromList) { s.hasDraft = true; s.saved = true; s.visibility = st === "private" ? "private" : "community"; } },
    render(ctx) {
      const st = ctx.state;
      const s = ctx.s;
      let d = D.directory.find((x) => x.id === ctx.ui.initiative) || D.directory[0];
      if (st === "empty") d = Object.assign({}, d, { needs: [], offers: [], links: [] });
      const name = st === "long" && d.longName ? d.longName : d.name;
      let notices = ctx.ui.flash ? H.notice(ctx.ui.flash.tone, ctx.ui.flash.title, ctx.ui.flash.body, "", "status") : "";
      if (st === "offline") notices += H.offlineNotice("Showing the copy saved on this device from your last visit.");
      if (st === "error") notices += H.notice("danger", "We could not load this initiative", "Try again in a minute.", H.btn({ label: "Try again", variant: "secondary", size: "sm", act: "retry" }), "alert");
      const asks = (list, kind) =>
        st === "loading"
          ? H.skeletonList(1)
          : list.length
            ? grid(list, (n) => `<article class="rc-card" data-kind="${kind}">${H.tagList(n.capitals)}<h3 class="rcp-ask-title">${H.esc(n.title)}</h3></article>`)
            : `<p class="rc-meta">Nothing listed yet.</p>`;
      const intro = s.intros[d.id]
        ? `<p class="rc-save-status" data-state="account">${H.icon("done", "sm")}Introduction requested</p>`
        : `${H.btn({ label: "Ask for an introduction", variant: "primary", width: "full", act: "intro", arg: d.id })}<p class="rc-meta">${H.canSeePartners(s) ? "They see your card and a line from you." : "Introductions are between initiatives on the list. Yours is asked to join first."}</p>`;
      const body = `<div class="rc-list-layout">
        <p><a href="#directory" data-go="directory">${H.icon("back", "sm")} Initiatives</a></p>
        ${d.imported ? "" : H.media(d.scene, "wide")}
        <div class="rcp-detail">
          <div class="rcp-detail-main">
            <header class="rc-card-header"><h1 class="rc-heading" data-size="page">${H.esc(name)}</h1><p class="rc-card-meta"><span>${H.icon(d.place === "Several places" ? "globe" : "place", "sm")}${H.esc(d.place)}</span>${H.stage(d.stage)}</p></header>
            ${H.workTags(d.lenses)}
            ${notices}
            <p class="rc-prose">${H.esc(st === "long" ? d.description + " " + D.meLong.description : d.description)}</p>
            <section class="rc-card-list" aria-labelledby="dneeds"><h2 id="dneeds" class="rc-heading" data-size="section">What they need</h2>${asks(d.needs || [], "need")}</section>
            <section class="rc-card-list" aria-labelledby="doffers"><h2 id="doffers" class="rc-heading" data-size="section">What they offer</h2>${asks(d.offers || [], "offer")}</section>
          </div>
          <aside class="rc-stack" aria-label="Get in touch">
            ${intro}
            ${H.linkList(d.links || [])}
            ${d.confirmed ? stamp(`Confirmed ${d.confirmed}`) : stamp("Imported, not confirmed yet", true)}
          </aside>
        </div>
      </div>`;
      return H.shell(ctx, { nav: "directory", body });
    },
  };

  // ----- Settings: everything set in place, leaving at the bottom -----
  Screens.settings = {
    title: "Settings",
    group: "Browse",
    states: Object.assign({}, U, { deleting: "Confirming delete", device: "Saved on this device only" }),
    preset(s, fromList, st) { if (fromList) { s.hasDraft = true; s.saved = st !== "device"; } },
    dialog(ctx) { return ctx.state === "deleting" ? { kind: "delete" } : null; },
    render(ctx) {
      const s = ctx.s;
      const st = ctx.state;
      const theme = ctx.theme || "system";
      const tier = D.tiers[ctx.width === "phone" ? "phone" : "desktop"];
      let notices = ctx.ui.flash ? H.notice(ctx.ui.flash.tone, ctx.ui.flash.title, ctx.ui.flash.body, "", "status") : "";
      if (st === "offline") notices += H.offlineNotice("Settings that touch the server wait for a connection.");
      if (st === "error") notices += H.notice("danger", "We could not load your account", "Try again in a minute.", "", "alert");
      const vis = (value, icon, title, note) => `<label class="rc-choice"><input class="rc-check" type="radio" name="visibility" value="${value}"${s.visibility === value ? " checked" : ""}><span class="rc-choice-text"><span class="rc-choice-title">${H.icon(icon, "sm")}${title}</span><span class="rc-choice-note">${note}</span></span></label>`;
      const toggle = (name, title, note, on, disabled) => `<label class="rc-choice"><input class="rc-switch" type="checkbox" role="switch" name="${name}"${on ? " checked" : ""}${disabled ? " disabled" : ""}><span class="rc-choice-text"><span class="rc-choice-title">${title}</span><span class="rc-choice-note">${note}</span></span></label>`;
      const n = s.notify || {};
      const initiative = !s.hasDraft
        ? `<p>Nothing is saved yet.</p><div class="rc-action-bar">${H.btn({ label: "Describe your initiative", variant: "secondary", size: "sm", go: "step1" })}</div>`
        : s.saved
          ? `<p class="rc-card-title">${H.esc(ctx.me.name)}</p><fieldset class="rc-choice-group" data-act-change="visibility"><legend>Who can see it</legend>${vis("private", "lock", "Private, for finding funding", "Only you. You see funding matches only.")}${vis("community", "globe", "Shared with the community", "Anyone. You see partner matches, and they can get in touch.")}</fieldset><div class="rc-action-bar">${H.btn({ label: "Change your card", variant: "quiet", size: "sm", go: "card" })}</div>`
          : `<p class="rc-save-status" data-state="device">${H.icon("device", "sm")}Saved on this device only</p><div class="rc-action-bar">${H.btn({ label: "Save with your email", variant: "secondary", size: "sm", act: "open-signin", arg: "save" })}</div>`;
      const email = s.saved ? `<section class="rc-stack rcp-settings-section" aria-labelledby="s-email"><h2 id="s-email" class="rc-heading" data-size="section">Email</h2><p>${H.esc(st === "long" ? "ana.beatriz.ferreira.dos.santos.guardias@nascentesdoaltoriodasalmas.org.br" : s.email)}</p><fieldset class="rc-choice-group" data-act-change="notify"><legend>What we email you about</legend>${toggle("reminders", "Funding reminders", "A week before a fund you chose closes.", n.reminders !== false)}${toggle("partners", "New partners", s.visibility === "community" ? "When a new initiative fits yours." : "Only once your initiative is shared.", n.partners !== false && s.visibility === "community", s.visibility !== "community")}${toggle("intros", "Introductions", "When someone asks, and when they reply.", n.intros !== false)}</fieldset></section>` : "";
      const body = `<div class="rc-narrow">
        <h1 class="rc-heading" data-size="page">Settings</h1>
        ${notices}
        <section class="rc-stack rcp-settings-section" aria-labelledby="s-init"><h2 id="s-init" class="rc-heading" data-size="section">Your initiative</h2>${initiative}</section>
        ${email}
        <section class="rc-stack rcp-settings-section" aria-labelledby="s-ai"><h2 id="s-ai" class="rc-heading" data-size="section">Assistant</h2>${H.guideStatus(ctx)}<p class="rc-meta">${s.modelReady ? (s.modelBuiltIn ? "Using this browser’s own assistant. Nothing was downloaded." : `On this device, ${tier.size}. A fuller one is ${tier.upgrade}.`) : "Not downloaded on this device."}</p><div class="rc-action-bar">${H.btn({ label: "What the assistant did", variant: "quiet", size: "sm", act: "open-ledger" })}${s.modelReady ? H.btn({ label: s.modelBuiltIn ? "Stop using it" : "Remove the assistant", variant: "quiet", size: "sm", act: "model-remove" }) : ""}</div></section>
        <section class="rc-stack rcp-settings-section" aria-labelledby="s-look"><h2 id="s-look" class="rc-heading" data-size="section">Appearance</h2><fieldset class="rc-choice-group" data-act-change="theme"><legend>Theme</legend><div class="rc-tag-list rcp-chip-row">${[["system", "System"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => H.chip({ type: "radio", name: "theme", value: v, label: l, checked: theme === v })).join("")}</div></fieldset></section>
        <section class="rc-stack rcp-settings-section" aria-labelledby="s-data"><h2 id="s-data" class="rc-heading" data-size="section">Your data</h2><div class="rc-action-bar">${H.btn({ label: "Export everything", variant: "secondary", size: "sm", act: "export" })}${H.btn({ label: "What we store", variant: "quiet", size: "sm", act: "open-privacy" })}</div></section>
        ${s.saved ? `<section class="rc-stack rcp-settings-leave" aria-labelledby="s-leave"><h2 id="s-leave" class="rc-heading" data-size="section">Leave</h2><p>Signed in as ${H.esc(s.email.length > 40 ? s.email.slice(0, 38) + "…" : s.email)}.</p><div class="rc-action-bar">${H.btn({ label: "Sign out of this device", variant: "secondary", size: "sm", icon: "back", act: "sign-out" })}${H.btn({ label: "Delete my account", variant: "quiet", size: "sm", act: "open-delete", className: "rcp-danger-text" })}</div></section>` : ""}
      </div>`;
      return H.shell(ctx, { nav: null, body });
    },
  };

  // The record and the privacy facts open as pop-ups over Settings, not as pages.
  Screens.ledger = {
    title: "Pop-up: what the assistant did",
    group: "Browse",
    states: Object.assign({}, U, { withdrawn: "Cloud consent withdrawn" }),
    preset(s, fromList) { if (fromList) { s.hasDraft = true; s.saved = true; } },
    base: () => "settings",
    dialog() { return { kind: "ledger" }; },
    render(ctx) { return under(ctx, "settings"); },
  };
  Screens.privacy = {
    title: "Pop-up: what we store",
    group: "Browse",
    states: { default: "Default", offline: "Offline", long: "Very long content" },
    base: () => "settings",
    dialog() { return { kind: "privacy" }; },
    render(ctx) { return under(ctx, "settings"); },
  };
})();

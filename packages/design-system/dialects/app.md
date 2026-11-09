---
version: alpha
name: Regen Commons App Dialect
description: Rules for the Weave installable web app on top of the core system.
extends: ../../DESIGN.md
surface: app
---

# App dialect

Weave runs on phones first, often on weak connections, for people who may visit once a month. Plain task screens carry the work.

- **Theme:** follow the system. The control lives in settings with System, Light and Dark. No header toggle.
- **Type:** base 16 px. Inputs stay at 16 px, so phones do not zoom. Reading text uses `reading-lg` in conversation and `reading-md` in cards.
- **Navigation:** the product name top-left returns home. Home, Partners, Funding and Initiatives are separate pages. Bottom navigation on phones, header navigation from 900 px. Focused steps keep the name and save status; every page has the footer.
- **Lists:** full-width card grids, equal heights and two-line title space. Search, filter menus, removable chips, count and sort share one bar. Pages align with the logo; narrow tasks stay at that edge.
- **Conversation:** one short prompt at a time, with the step map and the record beside it on wide screens and below on phones. Show `Assistant` and where it runs. A large Speak action comes before typing only when local speech is available. Files and links remain available throughout. Guided questions are the labelled D36 default; they ask for no extra structured fields.
- **Pencil and ink:** every derived value starts in pencil. Keep, Change and Remove are explicit decisions; Remove offers Undo. Confirmed corrections survive a rebuild. Unfinished edits block continuing and survive reload.
- **Saving:** `rc-save-status` is always visible during the intake. Offer saving inline once per seam, never as a modal. See [08-accounts-and-saving.md](../../../docs/platform/08-accounts-and-saving.md).
- **Texture:** no grain or canvas on task screens. The mark is static.
- **Offline:** the three steps work offline with a typed draft. A notice says when something is waiting for a connection.
- **Performance:** first paint under two seconds on a mid-range phone. Models load only on a clear opt-in, with size and a cancel button.
- **Device draft:** show saving, saved, memory-only and conflicting-tab states honestly. Keep full source words and file bytes; the short public card is editable. An unread file or page must say so. Links are references until a fetch adapter exists.
- **Needs and offers:** use one conversation pattern and an Ask list beside it on wide screens, below on phones. Show the active count out of five, every applicable kind, and an overflow notice. Kept cards stay fixed across rebuilding; removals offer Undo. Manual mode keeps earlier words and files accessible without extraction.
- **Finish:** show the checked initiative, needs and offers together with first funding and the Share card. Private initiatives see counts only. Unknown live counts stay unknown; invented matches require the development fixture label. Saving and sharing actions arrive with their Step 7 adapter.
- **Funding:** use the whole public catalog for visitors, with no fit before a checked initiative exists. Keep source dates, unknowns, readiness and research-priority groups separate from thematic fit. Exact program links never substitute another call. Optional applicant details stay local and outside intake. Team slots show private counts or shared candidates only in labelled development examples until requirements and services are approved.

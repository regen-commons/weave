# Search playbook

How discovery looks for funding programs, and how it records where it looked so the
next run starts somewhere else. The [verification standard](verification-standard.md)
governs what happens to a lead once it is found.

## Two inputs

The **source registry** is `research/discovery-sources.json`. Each source says what it
covers, what access costs, how to query it, how far to trust it and when a run last
used it. Its `role` decides what a listing is worth:

- `official-call-directory`: the publisher is the funder or the government. Its
  listing is evidence for the fields it shows. The binding call document still wins
  where they differ.
- `discovery-only`: databases, aggregators, community lists and forums. A listing is
  a lead. Never copy its text, dates or amounts into the catalog.

A source with `access.cost` of `paid` is not used without the user's approval. A
source marked `blocked` gets one attempt in a real browser per cadence, and the gap is
recorded otherwise.

The **coverage ledger** is `research/search-coverage.json`. A cell is one theme in
one place. `node scripts/research-plan.mjs discovery` lists the sources due by their
cadence and the cells due, never-searched first, then oldest.

To widen coverage, add a theme or a place to the ledger or a source to the registry in
a reviewed pull request. The plan picks it up as never searched.

## Search types

Run the types that fit the cell. Log every query, including the ones that found
nothing.

| Type | When | Pattern |
|---|---|---|
| Registry sweep | Each due source | Read the source's open and upcoming listings as its `query` note says |
| New call | Each due cell | `<theme terms> <call terms> <place> <year>`, in each of the cell's languages |
| Site-scoped | A known funder or portal | `site:<official domain> <call terms> <year>` |
| Reopening | A catalog program whose round closed | `site:<funder domain> "<program name>" <next year>` |
| Funded-by | A cell with few leads | Find who funded similar work (GrantNav, Karma GAP, round results, a project's "supported by" page), then search that funder's own site |
| Deadline sweep | Each due cell | `<theme terms> <deadline terms> <month> <year> <place>` |
| New fund | Monthly per theme | `<theme terms> "launches" OR "announces" fund OR call <year>` |

Use the current year and the next one. Prefer a search restricted to official domains
when the engine supports it. A search result or excerpt is a lead, even from an
official domain: open the page.

## Terms by language

Search each cell in the languages the ledger gives its place. Verify in the language
the funder published in, and keep the program's original name.

| Language | Call terms | Deadline terms |
|---|---|---|
| English (`en`) | grant, call for proposals, request for proposals, open call, funding opportunity, apply | deadline, closes, applications due |
| Portuguese (`pt`) | edital, chamada pública, chamada de projetos, seleção de projetos, apoio a projetos | inscrições até, prazo, encerramento |
| Spanish (`es`) | convocatoria, fondo concursable, subvención, llamado a propuestas | fecha límite, cierre de convocatoria, plazo |
| French (`fr`) | appel à projets, appel à candidatures, subvention | date limite, clôture |

## Terms by theme

| Theme | Terms to combine |
|---|---|
| Open-source public goods | open source, digital public goods, public goods funding, maintainers, free software, retroactive funding |
| Climate and restoration | restoration, watershed, agroecology, biodiversity, climate adaptation, reforestation, land stewardship |
| Community energy and digital inclusion | community solar, mini-grid, energy access, community network, broadband, digital inclusion |
| Culture and community education | community arts, cultural heritage, arts education, popular education, language revitalization, residency |

The five lenses in the PRD (art and culture, research, technology, place-based
community, funders) cut across these themes. Add a lens term when a cell returns
little, such as "research" with restoration or "artist" with watershed.

## Terms by form of capital

Every cell is searched for money. The plan also names one other form of capital for
the cell, rotating through all seven so each is covered in turn.

| Form | What to look for | Terms |
|---|---|---|
| Financial | Grants, prizes, investments, loans, matching pools | grant, prize, fund, investment, quadratic funding |
| Material | Equipment, hardware, compute or cloud credits, space | in-kind, equipment grant, credits, donated |
| Living | Land access, seed and seedling programs, restoration services | land access, seed grant, land trust program |
| Social | Networks, cohorts, introductions, fiscal hosting | fellowship cohort, accelerator, fiscal sponsor, network membership |
| Intellectual | Technical assistance, research support, pro bono expertise | technical assistance, pro bono, research partnership |
| Experiential | Residencies, training, mentoring | residency, training program, mentorship |
| Cultural | Arts, heritage and language support | cultural fund, heritage grant, arts council |
| Spiritual | Faith-based and contemplative funders and programs | faith-based grant, interfaith fund |

The catalog's program schema records instruments of money: grant, prize, investment,
fellowship, scholarship and mixed. A program that offers no money is recorded as a
lead with the disposition `non-cash-program` in `research/history-intake.json`, with
its official URL and what it offers. It is not imported as a program.

## Recording coverage

Write all of this in the same commit as the run's findings. A failure is recorded as
a failure. A failed request, a blocked page or a loading shell never means there were
no opportunities.

1. **The run entry** in `research/maintenance-review-log.json`. Each item in
   `searches` has `query`, `searchedOn`, `outcome`, and for cell searches `cell`,
   `type`, `language` and `formOfCapital`. Each item in `sources` has the URL, the
   registry `sourceId` when there is one, `retrieval`, `review` and `finding`, in the
   vocabulary of the [verification standard](verification-standard.md#recording-a-check).
   `coverageLimitations` says what the run planned and did not reach.
2. **The registry.** For each source attempted, set `lastUsed` to the date, the run id
   and what happened. After a candidate's first successful use, set `status` to
   `active` and correct its notes. After three failed runs in a row, set it to
   `blocked`.
3. **The ledger.** For each cell searched, add or update its entry in `cells`:

   ```json
   {
     "id": "climate-restoration/BR",
     "lastSearchedOn": "2026-11-23",
     "runId": "monday-discovery-2026-11-23",
     "forms": { "financial": "2026-11-23", "material": "2026-11-23" },
     "result": "3 leads followed to owners, 1 proposed, 2 held"
   }
   ```

   Keep the dates of forms searched by earlier runs. Mark a cell searched only when
   every one of its languages was searched; otherwise leave it due and say why in
   `coverageLimitations`.
4. **Leads.** A lead that was not resolved goes into `research/history-intake.json`
   as `pending`, or into the run's `deferredLeads` with the reason, so the next run
   continues it and does not rediscover it.

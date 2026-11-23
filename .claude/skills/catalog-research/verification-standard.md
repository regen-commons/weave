# Verification standard

What the catalog may say about a funding program, how long that stays true, and what
freshness runs do when it stops being true. The catalog tells people where to spend
scarce application time, so a wrong open label or a wrong deadline costs them more
than a missing program does.

## Official sources

A field is evidence only when it was read on an official source:

- the funder's or program owner's own site;
- a government portal's own listing, for the fields it shows;
- the binding call document: the regulation, guidelines, notice or request for
  proposals;
- an administrator or implementing partner the funder itself names.

Databases, aggregators, newsletters, forum posts, social posts and search excerpts are
leads. So is a page on an official domain that was only seen as a search excerpt.

When official sources disagree, the binding document outranks the overview page, and
a dated erratum or announcement outranks the document it amends. Record the conflict
in the program's `unknowns`. Do not settle it silently.

## What verified means

A **field** is verified on a date when a run retrieved the official page that day,
read the field there, and recorded the URL, the date and the fields in the program's
`evidence`.

A **record** is verified, and its whole-record date advances, only when one review
covered identity, application route and dates, applicant and work geography,
eligibility, award and the application URL, and each is either verified or written
down as unknown after reading the binding terms. A partial review advances the dates
of the fields it read and nothing else.

These never count as verification: a failed or blocked retrieval, a loading shell, an
unreadable download, an excerpt, a cached copy, or an earlier run's finding. An
archived proposal is a starting point for a new check, not a current fact.

Never invent or infer eligibility, currency, an amount, a date or rolling intake. An
annual program's next deadline is unknown until the funder publishes it.

## Field rules

| Field | Rule |
|---|---|
| Name | The funder's own name for the program, with any round label after a colon and no status words. See [program names](#program-names) |
| Identity | Legal or public name, official domain and country. Compare aliases, domains and existing source URLs before adding a funder |
| Route | `open` needs a published way to apply now. `rolling` needs the funder's own statement that it accepts applications continuously. `future` needs an announced opening. `closed` needs the funder's statement, a results announcement or a published cutoff that has passed. Use `unconfirmed` when intake could not be established |
| Dates | `opensOn` and `closesOn` are the dates as published, in the funder's local calendar |
| Cutoff | Set `deadlineInstant`, in UTC, only when the date, the time and the timezone are all published. "Anywhere on Earth" is UTC-12. If any part is missing or sources conflict, leave it null and say what is missing in the application note |
| Award | A total pool is not an individual award. Record currency only when stated. `current_offer` is for the round now open or announced, `historical` for past rounds |
| Geography | Keep where applicants must be registered apart from where work must happen |
| Instrument | Keep grants, prizes, investments, fellowships and in-kind support apart |
| Unknowns | List each term that matters to an applicant and could not be established |

### Program names

A program's name is what the funder calls it, in the funder's language. Do not put
status in a name: words such as closed, paused or unconfirmed belong in the route,
where a freshness run keeps them current.

When one funder has several rounds, tracks or tiers, add a label after a colon, such
as "Restack: first call 2026" or "Seabury Community Grants: Chicago". If the funder's
own name already has a colon, join the label with a comma. Never use an em dash in a
program or funder name. A year range keeps its en dash, as in "2026–27". Put a space
between a word and a year: "Roots Fund 2026", not "Roots Fund2026". A label the
funder writes as one token, such as FY2024, stays as written.

Renaming a program never changes its id. A rename that only applies this rule is
recorded in a rename archive under `research/maintenance-history/`, with the old and
new name of every program, and is not a revision of terms. A program that already has
a journaled revision is renamed through the
[revision workflow](../../../docs/program-revisions.md), with the funder's page read
that day as evidence for the name. `nameProblems` in `scripts/research-validation.mjs`
checks the rule, and the test suite runs it over the current catalog.

An opportunity is never an eligibility decision. The catalog records published terms;
it does not rule on whether an initiative qualifies.

## A new program

Propose a program only with all of: an official URL, the research date, the
instrument, the application route, applicant and work geography, eligibility and
fiscal sponsorship conditions, the award basis, dates, and explicit unknowns.
Anything short of that stays a lead.

## How long a check lasts

`research/review-intervals.json` holds these numbers. Change them there, in a reviewed
pull request. `node scripts/research-plan.mjs freshness` applies the closing and route
rows to decide which records are due. The other rows say what to reread once a record
comes up: if its eligibility, award or identity evidence is older than the limit,
read those too.

| What | Recheck within |
|---|---|
| A program closing within 21 days | 7 days of the last field check |
| Route and dates of an `open`, `rolling`, `inquiry`, `future`, `unconfirmed` or `unverified` program | 30 days |
| Route of a `closed`, `relationship`, `restricted` or `directory` program, or a funder with no program | 90 days |
| Eligibility, award, geography and costs of an active program | 90 days, and whenever a new round opens |
| Eligibility, award, geography and costs of an inactive program | 180 days |
| Funder identity, site and description | 180 days |

A run can set an earlier `nextReviewOn` for one record, such as an unresolved conflict
or a call due to open. It cannot set a later one than the interval gives.

Past these limits a record is overdue, not wrong. Report what is overdue. Never
advance a date to clear the queue.

## Recording a check

Every attempt is logged in `research/maintenance-review-log.json`, whatever it found.
Keep attempts and successful verification apart.

| Field | Values |
|---|---|
| `retrieval` | `retrieved`, `retrieved-excerpt`, `failed` |
| `review` | `verified` (every field named was read), `verified-fields`, `reviewed-no-terms`, `failed` |
| `result` | `verified`, `partial`, `excerpt-only`, `reviewed-no-terms`, `failed`, `unresolved-identity` |

Each entry names the record, `attemptedOn`, `verifiedOn` (whole-record reviews only,
otherwise null), `fieldVerifiedOn`, the `fields` actually read, `sourceUrls`,
`nextReviewOn` and a note. An unchanged source gets an entry without any rewrite of
the catalog.

## What a freshness run does with what it finds

| Finding | Action |
|---|---|
| Terms unchanged | Log the check. No catalog change |
| A term changed | Revise through the [revision workflow](../../../docs/program-revisions.md), with evidence dated that day. The previous revision is kept |
| A change that affects eligibility | The revision also replaces the program's screening conditions |
| The cutoff has passed and no new round is published | Retire the round, below |
| A new round is published | Add it as a new program under the same funder. The old round stays, closed |
| The source failed | Log the attempt. Terms and dates stay as they were. A failed retrieval is not a closure |
| The source has failed three runs in a row | Look for the program's new official address. If the funder's site is gone, record the funder as unreachable. Close nothing without an official statement |

## Retiring a record

Nothing is deleted: all 593 original identities, every later record, and every
program and source revision stay in the catalog.

- **A round that closed.** Set the route to `closed`, change an award basis of
  `current_offer` to `historical`, keep its terms and evidence, and note what
  established the closure. It moves to the 90-day interval, where a run looks for the
  next round.
- **A program the funder ended.** Close it the same way, quote the funder's statement
  in the application note, and name its successor if the funder names one.
- **A funder that stopped operating or merged.** Keep the identity. Record the
  official statement, close its programs, and add the successor as its own funder
  only when it has its own programs.
- **Not a funder after all.** Use the `not_a_funder` review status with the evidence.

A closed round does not mean the funder has stopped. Closure needs positive evidence:
a passed cutoff the funder published, a results announcement or a statement.

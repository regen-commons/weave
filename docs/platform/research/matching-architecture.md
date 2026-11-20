# One matcher for initiatives, partners and funding: a proposal

Status: proposal for the owner and council, 19 November 2026. Nothing here is
decided or built. It changes no production code. Open decisions D27, D29, D32 and
D35 stay open; this document gives evidence and recommendations for them.

The numbers come from an [offline experiment](../../../packages/api/evaluation/experiments/matching-architecture/README.md)
on committed fixtures and the public funder catalog, with a
[dated report](../../../packages/api/evaluation/experiments/matching-architecture/reports/2026-11-19.md).

## In plain words

Weave has two matchers that do not know about each other. One ranks funding
programs for an initiative. The other pairs one initiative's needs with another's
offers. The idea that joins them, a group of partners forming around a fund, exists
only as sample data.

The direction agreed on 19 November was to describe everything in one way (a fund
is like an initiative that offers money under conditions and asks for things), to
match in three steps (firm rules first, then search by meaning as well as by words,
then a reason the person can check), to build teams from the gaps between an
initiative and a fund, and to let a stated need for money drive the funding search.

After testing it, this is what we recommend.

1. **Use one way of describing things, with one addition.** A fund fits the shape of
   "offers" and "asks" well: 96% of the 730 programs in the catalog can be written
   as an offer of money with known terms. What does not fit is the conditions. A
   condition such as "the applicant must be based in Fiji" is not something anyone
   offers or needs. It is a rule about who may take up an offer. So the shared shape
   needs conditions, and it needs the few facts about an applicant that conditions
   are checked against.

2. **Search partner matches by meaning, in more than one language, and keep the word
   match as a second opinion.** On the existing test set, a small multilingual model
   raised relevant suggestions from 67% to 91% and the share of relevant partners
   found from 44% to 73%. In Portuguese the share found went from 22% to 72%. The
   English-only model the plan currently names did not manage Portuguese at all.
   These results are on a test set that had been looked at before, so they point a
   direction and are not yet proof.

3. **Build teams from gaps, but only where a fund's team requirement has been written
   down properly.** Today 3 of 730 programs have one. Reading the catalog's free text
   suggests about 23 programs require a team and about 32 more allow one. That is a
   bounded steward task, tens of programs and not hundreds. The prototype also showed that
   word matching alone picks the wrong partner too often, so each requirement needs a
   checkable condition such as "must be a public body".

4. **Keep the funding ranking as it is.** Do not replace it with the new matcher. Its
   value is in its sourced rules and its caution, the live Funding Commons site runs
   on it, and nothing we measured says a replacement would be better. Join the two
   at the level of shared descriptions and reasons, not by rewriting the scoring.

5. **Let a need for money sharpen the funding search, not replace it.** Only 13% of
   programs state a current amount and 4% have a closing date still ahead, so amount
   and timing can filter very little. The purpose text helps. The description of the
   initiative stays the main query.

Three things the evidence does not support, and we say so plainly: replacing both
engines with one, relying on the English model already named in the plan, and
suggesting funds for a pair of initiatives because their two descriptions together
cover a fund's themes.

One finding matters for people more than for code. Often the only way a partner can
close a gap is by becoming the applicant. Then the fund assesses them, not you. The
design says this in words every time, and never calls a team eligible.

## What was measured

| Question | Result | Sample |
|---|---|---|
| Programs that fit as a money offer with known terms | 96% | 700 of 730 programs |
| Programs with any structured condition | 35% | 253 of 730 |
| Programs with a structured team requirement | 0.4% | 3 of 730 |
| Programs whose prose requires a team (one unreviewed reading) | 3.2% | 23 of 730 |
| Relevant among top-five partner suggestions, current matcher | 67% | 24 of 36 suggestions, 45 queries |
| The same, multilingual model with keyword evidence it can veto | 91% | 39 of 43 suggestions, 45 queries |
| Relevant partners found in the top five, current to proposed | 44% to 73% | 45 queries |
| Queries with a relevant partner and no suggestion, current to proposed | 21 to 9 | of 45 |
| Portuguese: relevant partners found, current to proposed | 22% to 72% | 9 queries |
| Queries with no relevant partner that still got a suggestion | 2 to 2 | of 8 |
| Team examples that ended as intended | 13 of 13 | fictional initiatives, real programs |
| Team examples where word matching alone chose a wrong partner | 2 of 4 compared | same |

The partner numbers are from the v3 holdout in
[the evaluation folder](../../../packages/api/evaluation/README.md). That holdout
was examined before this work, it is synthetic and judged by agents, and it has 64
candidates. Thresholds were set on a different fixture, but two of the variants were
added after the first scored run. Read every figure as directional.

## The questions, with evidence

### 1. Can a funding program share the shape of needs and offers?

Mostly yes. Every program was mapped into this shape:

- A **party** is an initiative or a program.
- An **entry** is an offer or an ask. It carries forms of capital, text, an amount,
  a time window, exchange terms and a status.
- A **condition** sits on an entry and says who may take it up. It is checked
  against **facts** the other party has shared.
- Every entry and condition records where it comes from: `confirmed` (an owner
  reviewed and shared it), `researched` (a steward read it in an official funder
  source on a dated check), `published` (a source says it and nobody confirmed it),
  or `inferred` (read out of described work).

A program becomes one offer of financial capital, the conditions on that offer, and
two kinds of ask: work in its focus areas, and partners where it requires them.
This uses the platform's existing terms. An opportunity stays an opportunity; the
shape is how the matcher reads it, not a new name for it.

What fits, from 730 programs:

| Part | Fills for | Note |
|---|---:|---|
| Terms (given, or paid back) | 96% | Grants, prizes, fellowships and scholarships are gifts; investment is paid; 30 are mixed or unknown |
| An ask for work in named focus areas | 99% | This is what thematic fit already compares |
| Status | 100% | 13% open, 34% closed, 23% by invitation, 17% unverified, 9% ask first, 3% not open yet |
| What the money may be used for | 35% | |
| Closing date | 32% | |
| Amount | 31% | 13% as a current offer; the rest historical |

What does not fit:

- **Conditions are not needs.** 135 fact rules (applicant type, base country, work
  countries and so on) and 301 sourced statements sit on 253 programs. They describe
  who the applicant must be. This is the main reason the shape needs conditions and
  facts, not only needs and offers.
- **Most conditions are prose.** 373 programs (51%) have requirements only as free
  text, 2,148 strings in all. The shape can carry them as text. It cannot check them.
- **A program has no owner in Weave.** Nobody confirms it, shares it or answers an
  introduction. Its evidence class is `researched`, which behaves like a published
  offer: the source's words are kept, and availability is never asserted.
- **Research notes have no home.** Geography scope prose (643 programs), award notes
  (690) and lists of unknowns (729) stay in the catalog and are shown from there.

One thing the mapping makes clear: funding is already a two-way match. The program
offers money and the initiative needs it. The program asks for work in its focus
areas and the initiative's described work answers that. Thematic fit is the second
half. The first half, need against offer, is what question 5 adds.

**Sizing D29.** Four conditions on three programs carry the `partner` category
today. Reading the 192 programs whose text mentions partners, consortia, teams,
fiscal sponsors or nomination gives: 23 that require more than one organization,
32 that allow it, 52 that accept or require a fiscal host, 41 where "partner" means
the funder's own grantees, and 44 where the word means something else. So real team
asks need entering for roughly 55 programs, or 107 with fiscal hosts. This is one
agent's reading of one line per program and needs a steward's review.

### 2. What would one matcher look like?

Three layers, the same for every pairing of an ask with an offer.

```text
          ask                          candidates
           |                               |
   1  GATES            kinds that can answer each other, status and expiry,
      deterministic    explicit conflicts in terms, place and timing,
      and sourced      conditions checked against shared facts
           |
   2  RETRIEVAL        keyword evidence (words and known phrases)
      two signals      meaning evidence (multilingual embedding)
           |
   3  EVIDENCE         accept: meaning stands out, or keywords that meaning does not veto
      and reasons      order: confirmed, then published, then inferred
                       return: the passage, the reason, what is unknown, versions
```

Proposed modules and their contracts. None of this is built.

| Module | Takes | Returns | Comes from |
|---|---|---|---|
| Shape | A catalog program, or an initiative's shared entries and facts | A party with entries, conditions and evidence classes | New. Prototype in `shape.mjs` |
| Gates | An ask, a candidate entry, the facts each side shared | Allowed or not, with the rule that decided and what is unknown | `compatible()`, the negation and request rules and the evidence-kind order in `partner-matcher.ts`. For programs, `checkEligibility` from the root module, called and not copied |
| Retrieval | One ask | A bounded shortlist with a keyword rank and a similarity for each candidate | The existing `matching_shortlist` path and pgvector index, with a multilingual model contract |
| Evidence | The shortlist | Accepted matches with reasons, the supporting passage, unknowns, evidence kind and versions | `supportingEvidence` today. New: the veto and a "similar meaning" reason |
| Teams | A funding evaluation, the program's asks, the pool of shared entries | Gaps, the smallest covering team, what stays open, leads to check | New. Prototype in `teams.mjs`. Replaces the fixtures in `packages/app/src/funding/team.ts` |

Keep, replace, retire:

| | What | Why |
|---|---|---|
| Keep | All of `dist/matching.mjs`: thematic fit, the eligibility checks, readiness and the priority caps | It is the gate layer for programs, it is sourced, and the live site runs on it |
| Keep | The safety rules in `partner-matcher.ts` and their tests in `safety-gates.test.mjs` | Ownership, expiry, evidence kind and order are right as they are |
| Keep | `partner-concepts.ts` | As keyword evidence and as a plain reason people can read |
| Replace | Keyword overlap as the only test of relevance | All 15 wrong suggestions from the current matcher on the holdout came from it |
| Replace | The English model as the partner retrieval candidate in spec 7.1 | It returned a suggestion for all three Portuguese queries that have no relevant partner |
| Retire | The weighted partnership formula and the "union of themes, places, lenses" in [spec 7.4](../05-technical-spec.md#74-partnership-score-r14) | Adding a partner's countries to yours would make a conflict disappear without the work moving. The prototype treats place of work as something a partner cannot change |

**The live site stays unharmed** because nothing in the root modules changes. The
app already imports `dist/matching.mjs` without moving or copying it
(`packages/app/src/funding/engine.ts`), and the Teams module would read its output
the same way. New code lives in workspace packages. The fund vectors the live site
uses keep their own model contract; partner vectors would have a different one and
the two are never compared, as spec 7.1 already requires. Root
`bun run build && bun run test` stays the check after every step.

### 3. Does retrieval by meaning help?

Yes, with a multilingual model, and less simply than "hybrid" suggests.

| Engine on the v3 holdout | Relevant among top five | Found (recall at five) | Silent on a query that has an answer | Suggestion where there is no answer |
|---|---:|---:|---:|---:|
| Current matcher | 24 of 36, 67% | 44% | 21 of 45 | 2 of 8 |
| English model in the plan, with veto | 34 of 41, 83% | 64% | 12 | 5 |
| multilingual-e5-small, with veto | 39 of 58, 67% | 73% | 3 | 6 |
| multilingual MiniLM-L12, meaning only | 34 of 35, 97% | 66% | 10 | 2 |
| multilingual MiniLM-L12, keywords or meaning | 40 of 53, 75% | 73% | 8 | 2 |
| multilingual MiniLM-L12, keywords with veto | 39 of 43, 91% | 73% | 9 | 2 |

The 95% interval for the last row is 83% to 98% relevant and 60% to 84% found. Its
gain in recall over the current matcher on the same queries is 16 to 42 points.

What we learned:

- **The model matters more than the method.** Ranked with no threshold, the
  multilingual MiniLM model puts a relevant candidate in the top five for 93% of
  queries, against 56% for keywords, 75% for the English model and 81% for
  multilingual-e5-small. Across languages it found every one of 9; keywords found
  none.
- **Thresholds do not travel.** A cut-off tuned on one fixture gave 97% relevance for
  one model and 30% for another on the next fixture. A relative measure (how far a
  candidate stands above the others for the same query) held up better. Any launch
  needs its thresholds set on a development set drawn from the real corpus.
- **Keywords add recall and nearly all the errors.** With the MiniLM model at its
  cosine threshold, adding keyword evidence raised recall from 57% to 73%. Of the 16
  wrong suggestions in that mix, 15 came in on keywords alone. With a veto on keyword
  evidence that sits low for the query, 3 remained.
- **Fusing the two rankings was worse** than the meaning rank alone on this corpus
  (82% against 93% at five). The value of keywords is in the evidence a person can
  read and in recall, not in the ordering.
- **Both multilingual models cost about 135 MB to download** against 25 MB for the
  English one, and embed a short text in about 10 ms on a laptop CPU.

No real-project corpus existed on any branch when this ran, so none was used.

### 4. How do gap-driven teams work?

**Listing the gaps.** Everything comes from the funding engine's existing output for
one initiative and one program, plus the program's asks.

| From the engine | Becomes | Can a partner change it? |
|---|---|---|
| A rule check with outcome `conflict` on applicant type, base country or registration country | A gap | Only by a different applicant, or by a fiscal host where the program's record says sponsorship is accepted |
| A rule check with outcome `conflict` on work or benefit countries or states | A blocker | No. The work is where it is |
| A sourced condition answered "no", category `partner` | A team ask | Yes |
| A sourced condition answered "no", any other category | A blocker | No. It is the applicant's own answer |
| A rule check that is `missing` | "Tell us first" | It is a question for the person, not a gap |
| An unanswered prerequisite condition | "Still to confirm" | Listed under every result |
| Readiness of closed, funding resource, or outside funding preferences | A blocker | No |
| A program's structured asks | A team ask each, unless the person says "that is us" | Yes |

**Finding partners.** The pool is only initiatives that have shared an entry. Each
team ask goes through the one matcher as if it were a need. A match counts only when
it is a confirmed shared offer and, where the ask carries a condition, the partner
has shared the fact that meets it. Someone who would lead must have said so in the
offer they shared. Work described on a public project page is listed as a lead to
check and is never counted.

**Combining them.** Gaps are few and pools are small, so the prototype tries every
set of up to three partners and every choice of who leads, and keeps the one that
leaves the fewest gaps, then the fewest partners, then keeps you as the applicant
where it can. Nobody is on a team without closing something. Greedy set cover would
do the same job if pools grow.

**The reverse.** For two initiatives that already have a confirmed fit in Partners,
run the forward search over the catalog with the other as the only candidate, and
list programs where they close a gap for you. A second idea, that a fund suits the
pair because their two descriptions together cover its themes, fired for no program
in either test pair. It is not part of this proposal.

**What the person sees.**

- On a fund: "This fund asks for a team" with each ask in the funder's words and
  its source, then who could cover it, the entry they shared, and why.
- If the lead changes: "Cascadia Adaptation Practice would be the applicant and you
  would join as a partner. That changes who the funder assesses."
- What remains: asks still open, requirements still to confirm, and one line that
  this is a lead to research and not an eligibility decision.
- Leads from public pages, separately: "A public project describes this role. We do
  not know if they are available."
- Someone who has shared nothing sees "2 initiatives could cover 2 of 2 asks. Share
  an entry to see who" and no names or reasons (D27).
- The action is to start a partnership (a recipe) around the fund with those asks as
  its ingredients, and to ask for introductions. That part is existing plan, R21 and
  R22.

**Worked examples** on real catalog programs and fictional initiatives:

| Case | Outcome |
|---|---|
| A community group and a US climate adaptation grant that asks for a community organization, a local government and a practitioner who applies | Two shared initiatives cover both open asks; the practitioner leads |
| The same with no shared local government | One of two covered. A public project describing that role is a lead, not a cover |
| A Kenyan network and a program with a sourced Dutch-partner condition | One shared Dutch foundation covers it |
| Kenyan work and a program that funds work only in the United States | Nothing. A partner cannot change that |
| An applicant who must be based in Fiji | Nothing. Nobody shared there offers to lead |
| A scholarship for individuals | Nothing |
| A partnership of at least three organizations, one candidate shared | One of two places covered, and it says so |
| A charity with nothing in the way | No team needed |
| Two initiatives with no confirmed fit, asked for funds as a pair | Nothing |

Two of four compared cases went wrong when word matching alone chose the partner: an
Italian cooperative was accepted as a "local government partner" and a US county
office as a "third-sector organization". The condition on the ask fixed both. This
is why step 3 of the build needs shared facts before teams.

### 5. What if the need for money is the funding query?

A financial need carries an amount, a purpose and a timeframe. Tested on one
fixture need of USD 80,000 to 100,000:

- **The need as the query** (its purpose in the text, its amount as the goal) changed
  3 of the top 10 programs. There is no labelled funding set, so whether that is
  better is unknown.
- **Amount** could be compared for 54 of 730 programs, those with a current award in
  the same currency. For 35 of them the award is smaller than the need, which the
  engine already treats as "may fund part", not a conflict.
- **Timeframe** could act on 29 programs with a closing date still ahead.

So the need sharpens the query and cannot be the query. The recommendation:

- The funding form loses its goal range and currency; they come from the financial
  need. The purpose of the need is added to the text that thematic fit reads.
- The form keeps what a need does not carry: countries of work and benefit,
  applicant type, base and registration country, funding types. It becomes a short
  "About the applicant" card. These are the same facts team matching needs, so the
  person fills them once and chooses whether to share them.
- An initiative with **no financial need** sees Funding ranked from its description
  and themes, as today, with one line: "Add what you need money for to sharpen
  this." Nothing is hidden or held back.
- An initiative with several financial needs sees results for each need, since
  purposes differ.

### 6. What data can the design count on at launch?

| Source | What exists | Status |
|---|---|---|
| Funder catalog | 699 funds, 730 programs, 98 open | Committed and maintained weekly |
| Public Certified projects | 1,128 projects and 12,244 non-empty description blocks, about 11 a project, seen on 10 November. A full refresh took 36 to 42 seconds locally on 15 November | Measured counts. Language mix, text quality and domain spread are not measured |
| Shared needs and offers | None measured. Network matching needs a verified project link and one shared entry | Assume close to zero on day one |
| Shared applicant facts | None. They do not exist yet | Proposed here |
| Earlier hand-kept hub document | 7 initiative rows and 8 partnership calls | Imported records start unconfirmed (R6) |

The thin-network experience follows from the rules. Funding works for everyone from
the first visit. Partner suggestions come mostly from public project pages, labelled
as work described and not as an offer. Team views will usually say that no shared
initiative covers an ask yet. That state has to be useful, so the design turns it
around: an uncovered ask becomes a prompt to the people who could fill it ("This
fund needs a fiscal host in the United States. Is that something you offer?"), and
the pulse already has a slot for partnerships that need an ingredient. Until shared
entries number in the tens per region, teams are a way to recruit offers more than a
way to find them.

### 7. Where does each step run, and what leaves the device?

| Step | Runs | What leaves the device | Depends on |
|---|---|---|---|
| Funding gates and ranking | Device, in a worker, over the public catalog | Nothing | Nothing new |
| Private needs and offers against public projects | Device, keyword matching over the bounded public snapshot, as now | The workspace ID only | Nothing new |
| The same by meaning | Device, with a 135 MB model download | Nothing | D32, and a host for a file over the 25 MB asset limit in `scripts/build-ai.mjs`. Not recommended for launch |
| Embedding public project passages | Server job at the daily refresh | Nothing from any device | D32 for the model. No outside AI service |
| Embedding a shared entry | Server job when the owner shares, over the reviewed projection only | Nothing beyond what the owner chose to share | D32. Both jobs already exist behind a switch that is off |
| Partner search for shared entries | Server at request time, SQL over stored vectors. No model runs in the request | Entry IDs and revisions, never draft text | The existing activation approval for semantic retrieval |
| Team cover, names | Server, for a viewer with a shared entry | The program and the viewer's shared facts | D27, D29 |
| Team cover, counts for a private viewer | Device, against a published summary of offers by role with no names. Design only: the prototype computes the full result and then hides names | Nothing | D27, and a rule for small counts (proposed below) |
| Drafting a program's asks from funder pages | Steward's tool, public text only | Public funder text | D29. D18 and D35 only if a cloud model is used |

No step in the recommended path calls a cloud AI service, so D18 and D35 do not
block it. The models are open weights run in Weave's own jobs. Private text never
gets embedded off the device. The cost of that choice is that someone who has not
shared gets keyword matching, which is weakest for people writing in Portuguese.

Rough size and cost, from measurements on one laptop, to be repeated on the host:

| | English model in the plan | Either multilingual model |
|---|---:|---:|
| Download | 25 MB | 135 MB |
| Vector | 256 numbers | 384 numbers |
| Embed one passage | 4 ms | 9 to 10 ms |
| Embed about 12,000 public passages once | under 1 minute | about 2 minutes |
| Stored vectors for 12,000 passages | about 12 MB | about 18 MB |
| Fee per request | none | none |

Whether a 118 MB model file fits the hosting tier's function limits, and its cold
start there, is not measured.

### 8. What else could we build?

**A. Keep two engines and add a thin layer between them.** A Teams module reads the
funding engine's gaps and the partner matcher's results and nothing else changes.
This is the cheapest route and it is close to what we recommend for the funding
side. On its own it leaves partner matching at 67% relevant and 44% found, and the
team prototype showed that weak partner matching produces wrong teams. We would
choose it only as the first step.

**B. Fold everything into one ranker.** Programs are embedded like entries, one
score orders partners and funds, and the funding rubric is retired. It is the
tidiest design. We would not choose it: the rubric's sourced caps and readiness
labels are the product's caution, there is no labelled funding set to show a
replacement is no worse, and the live site depends on the current modules.

**C. A graph.** Initiatives, entries, programs and places as nodes, with team
formation as a flow or stable-matching problem and recommendations from paths. This
suits fairness across a dense network, and the pulse's exposure caps could use it
later. With close to zero shared entries at launch there is no graph to walk. Not
now.

**D. A learned ranker.** Either a small model that reads an ask and a candidate
together and scores the pair, or weights learned from saves and dismissals. The
first needs no training data and may replace thresholds altogether; it is worth one
experiment in stage 1. The second needs feedback that R15 has not started
collecting.

**E. A language model as the judge.** A cloud model reads pairs and decides. It
would understand more than any of the above. It adds a fee and a delay to each
request, depends on D18 and D35, and makes reasons harder to trace to a passage. We
would use one only where a steward reviews the result: drafting a program's asks
from public funder text for D29.

**Our choice** is the agreed direction for the shared shape, the three layers and
gap-driven teams, with alternative A's restraint about the funding rubric.

## Staged build

Each stage ends with root `bun run build && bun run test` passing and the live site
unchanged. Matching is a critical or sensitive surface, so each stage that touches
`packages/api` needs a second review.

| Stage | Work | What it proves | Waits on |
|---|---|---|---|
| 0. Done | This proposal and the offline prototype | The shape fits; a multilingual model beats the current matcher on an examined holdout; the team rules hold on fixtures | |
| 1. Measure again | A new holdout written and judged blind, with permitted real passages when the other evaluation delivers them, at least 20 needs and 20 offers per domain, Portuguese negations and hard negatives. Fix the threshold rule first. Compare the veto with a pair-scoring model | Whether 91% and 73% hold. Which model. A recall floor | A recall floor from the owner |
| 2. Evidence layer, switched off | Change the model contract in the two existing embedding jobs, add the evidence layer and a "similar meaning" reason to the matching contract, keep keyword matching as the fallback | Hosted size, cold start and latency. Safety tests unchanged | D32; stage 1 passing |
| 3. Applicant facts and roles | The "About the applicant" card, optional sharing of three facts, a role on offers. The funding form loses its goal fields to the financial need | Whether people will share these facts. Funding results unchanged for existing drafts | Proposals 1, 2 and 5 |
| 4. Asks in the catalog | A steward enters asks for the 23 programs that require a team, then the 32 that allow one, each with source and date. Importer and schema change through the catalog's own workflow | Steward time per program. Whether the format holds for real calls | D29 |
| 5. Teams on a fund | The forward team view: names for shared viewers, counts for private ones, start a partnership from it | Whether suggested covers are right when a steward checks them. Whether anyone acts | D27; stages 2 to 4 |
| 6. The reverse, and the pulse | "Funds you two could apply for" in Partners, for the gap reason only. Uncovered asks as prompts in the pulse | Uptake | Stage 5 |

Turning on semantic retrieval in production remains its own approval after stage 1,
as the plan already says.

## Decisions for the owner and council

Existing open decisions this work informs. None is closed here.

| ID | What we recommend | Evidence |
|---|---|---|
| D29 | Steward-entered asks, each with the funder's words, a source and a date, a role, a count and an optional condition on whoever fills it. Start with the 23 programs that require a team. Show coverage as "2 of 3 asks", never a score. Drop the union of places from spec 7.4 | 3 of 730 structured today; 23 require and 32 allow by one reading; two wrong covers from text alone |
| D32 | Add partner retrieval to the model benchmark. Test multilingual MiniLM-L12 and at least one alternative on a new holdout. Run it in server jobs first. Leave the live site's fund vectors as they are | 91% against 67% relevant, Portuguese 72% against 22% found, both directional |
| D27 | Confirm that counts-only applies to the team view, and decide how small counts are shown | Prototype enforces it; a count of one can point at one initiative in a small network |
| D35, D18 | No decision needed for this path. They return only if a cloud model drafts asks | No step calls a cloud service |

New questions, offered as proposals. They are not in the register.

| | Proposal | Why it needs a person |
|---|---|---|
| 1 | Owners may share three applicant facts for matching: applicant type, base country and registration country | New shared data. Without it no rule-based gap can be closed |
| 2 | An offer may carry a role: lead applicant, co-applicant, fiscal host or local partner | Changes the offer card |
| 3 | Weave may suggest that another initiative applies and you join | It changes who the funder assesses. Some may find it unwelcome |
| 4 | Private viewers see "some" below a set count, not an exact number | Privacy against usefulness |
| 5 | The financial need replaces the goal range and currency in the funding form | Changes a shipped form and stored drafts |
| 6 | A recall floor for partner matching | The spec has an 80% relevance target and no floor; a matcher can pass by saying little |

## What remains unverified

- Every partner-quality number. The holdout was examined before, is synthetic, is
  judged by agents and has 64 candidates. The real corpus has over a thousand
  projects and messier text.
- The two variants that performed best (relative threshold, veto) were added after
  the first scored run. Their cut-offs come from development data, but the choice to
  try them does not.
- Portuguese results rest on 9 queries. No other language was tested. The negation
  and request rules are English only, so "we no longer offer" in Portuguese passes.
- multilingual-e5-small was run with its retrieval prefixes. Its model card also
  describes a symmetric setting, which was not tried.
- The licences of the two converted model repositories. The upstream models are
  Apache-2.0 and, by its listing, MIT; the conversions state none.
- Model size, cold start and speed on the hosting tier and in a browser. All timings
  are from Node on one laptop.
- The reading of which programs require a team. One agent, one line per program,
  funder sources not opened.
- Whether gap-driven teams are useful. The initiatives are fictional and written by
  the author of the code. The examples show the rules hold, not that people want the
  result.
- Whether a financial need improves funding results. There is no labelled funding
  set.
- The language mix and text quality of public Certified projects.
- Whether people will share applicant facts or offer to lead an application.
- How a private viewer's counts are computed without sending their gaps to the
  server. The table in question 7 describes a design; the prototype does not
  implement it.

## Sources

- Repository: [PRD section 5 and R12 to R16](../04-prd.md#5-core-concepts-and-vocabulary),
  [technical spec section 7](../05-technical-spec.md#7-matching-engine),
  [open decisions](../open-decisions.md#for-the-builders),
  [partner matching evaluation](../../../packages/api/evaluation/README.md),
  [project index validation](../../../packages/api/evidence/project-index-validation-2026-11-10.md)
  and [all-public index evidence](../../../packages/api/evidence/project-index-all-public-2026-11-15.md).
- Model cards and file listings on Hugging Face, read 19 November 2026:
  [mixedbread-ai/mxbai-embed-xsmall-v1](https://huggingface.co/mixedbread-ai/mxbai-embed-xsmall-v1),
  [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)
  (its FAQ requires the `query: ` and `passage: ` prefixes),
  [sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2),
  [Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small)
  and [Xenova/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2).
- Reciprocal rank fusion: Cormack, Clarke and Büttcher, "Reciprocal rank fusion
  outperforms Condorcet and individual rank learning methods", SIGIR 2009. Cited
  from memory, not re-read for this work.
- Hybrid search in Postgres: [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search)
  and [pgvector](https://github.com/pgvector/pgvector), as the technical spec already cites.

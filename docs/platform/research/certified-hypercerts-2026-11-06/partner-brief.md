# Reuse a project profile, return when the work changes

Draft for Regen Commons review and possible sharing with Ma Earth and Hypercerts · 6 November 2026. This proposes a pilot; it makes no commitments on behalf of any team.

Companions: [Technical spec and evidence](technical-spec.md) · [Design spec](design-spec.md) · [Updated business model canvas](business-model-canvas.md).

## The proposal

Weave could let a project team reuse its existing public project profile, then say what it needs and what it can offer across eight kinds of support. The project would keep its shared profile in the Certified and Hypercerts ecosystem. Weave would hold its private working drafts, needs and offers, and the permissions and consent needed for collaboration and matching.

This would shorten the first visit. It would also give teams a reason to return between funding rounds: a need changes, an offer becomes available, or a potential partner appears. On those visits, Weave could help teams notice outdated project details and return to the source to correct them. More frequent use producing fresher profiles is a hypothesis to test, not an established outcome.

Weave is Regen Commons' developing platform for regenerative initiatives to find partners and funding. Its current plan combines place-based work, research, technology, art and culture, and funders. The new product direction uses Certified as its only sign-in, with explicit private saving and no separate Weave account registration or migration. The email-free local proof passed; hosted integration remains to be built and validated. Its Phase 0 target is **30 November 2026**. Reusing a public project remains optional. [Weave PRD](../../04-prd.md), [live saving scope](https://github.com/regen-commons/funding-commons/blob/495e95ae6ea27521f355bc7f10af1488a1e290d9/docs/platform/08-accounts-and-saving.md#private-account-connection), [delivery plan](../../01-proposal-brief.md).

## What the evidence supports

Ma Earth, Certified and Hypercerts have distinct roles. Ma Earth runs the application and funding experience. Certified, operated by Hypercerts Foundation, provides account and data-hosting services. Hypercerts provides shared record formats on AT Protocol. Its project convention is a project collection published by a person or organization. [Ma Earth privacy, 23 July 2026](https://maearth.com/privacy), [project model, accessed 6 November](https://docs.hypercerts.org/core-concepts/projects-and-collections).

Unauthenticated public reads worked during this research: we retrieved an organization profile and its four separate project records. This supports profile reuse now. Some project fields were missing, so people still need a short review. Certified's group service documents multiple editors, but its permissions do not automatically authorize access to Weave's private records. No authenticated partner writes or recovery procedures were tested. [Read evidence](technical-spec.md#read-only-example), [CGS documentation, accessed 6 November](https://docs.hypercerts.org/reference/services/certified-group-service).

We did not find a documented shared schema for Weave's complete needs and offers. The first pilot should therefore read upstream and save privately in Weave. Public needs and offers can follow once the teams agree a useful format, its readers and its lifecycle. Publishing to AT Protocol needs a separate consent step because records can be copied beyond the originating service. [Schema assessment](technical-spec.md#4-where-needs-and-offers-belong), [Ma Earth terms](https://maearth.com/terms).

## What each participant could gain

| Participant | Potential value to test |
|---|---|
| Project teams | Less repeated profile entry; current needs and offers; funding suggestions and, when sharing is ready, reasons to meet relevant collaborators. Existing private drafts remain usable. |
| Ma Earth | A use for project records between rounds; participating teams identify stale details; links back to the original work and future applications. Weave would not run or replace Ma Earth's funding process. |
| Hypercerts and Certified | A distinct application reading existing records, evidence about schema gaps and team permissions, and potentially a reusable needs/offers extension with a second consumer. |
| Regen Commons | A clearer member utility, less duplicate profile maintenance, and better context for coordination across places and kinds of support. Membership remains separate from project ownership. |

These benefits build on Hypercerts' reported reuse of Ma Earth records by GainForest and its account of continuing project updates, while extending into a different workflow. [Hypercerts case study, 18 September 2026](https://hypercerts.org/blog/3mvru46xfus2r).

## A small test

Invite, after team approval, six willing teams with existing public project records and two teams without one. Observe the linked or ordinary intake, checked needs/offers, private Save and second-device Load. Include a project with missing details and two teams willing to test two-editor scenarios later using synthetic shared data. Return after two weeks to see whether a real need, offer or profile detail changed. Recruitment and messages are not authorized by this brief.

The first build is Certified sign-in and private Save/Load, following the [build contract](../../05-technical-spec.md#51-first-build-certified-sign-in-and-private-saving). Read-only profile reuse follows when privacy and recovery checks pass. Assess schedule fit against the 20 November evidence milestone and 30 November target; no partner integration bypasses release gates. Suggested gates: at least five of six linked teams choose the correct project without help; at least six of eight save and reload without help; no private disclosures or lost edits; and at least four of eight return and make a useful confirmation or update. These are small-pilot decision rules, not statistical proof. [Metrics and stop conditions](business-model-canvas.md#pilot-and-decision-rules).

## Requests for discussion

**For Ma Earth:** identify the supported mapping from a project page to its AT URI; confirm which public fields are authoritative and where teams should edit them; explain how organizations currently invite colleagues and recover access; consider helping recruit a few willing teams after the pilot is approved. Confirm reuse and attribution expectations, especially for media and location details.

**For Hypercerts and Certified:** confirm recommended read endpoints and version compatibility, index lag and limits, the OAuth/group authorization path, and production transfer/recovery behavior. Our indexed reads succeeded while direct Certified PDS reads returned 403 from the research environment. Help establish the supported direct-read path. Review whether typed needs/offers should use a new Lexicon or a supported extension, and nominate a second application to test interpretation before public writes.

**For Regen Commons:** agree the pilot owner, time budget and public-data policy; keep joining, browsing and unlinked drafting available to people without a Certified project; decide how non-owner collaborators receive Weave rights and whether any future member gate has a team-collaborator exception. The pilot should not decide those policies by accident.

## Sources

Research date: 6 November 2026. The [technical draft](technical-spec.md#sources-and-research-limits) records the pinned upstream baseline, official schemas, public endpoint observations and remaining verification limits. Weave's [existing business model canvas](../../02-business-model-canvas.md), dated 31 October 2026, is the business baseline. This brief uses public and checked-in sources only.

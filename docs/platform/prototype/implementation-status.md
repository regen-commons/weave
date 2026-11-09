# Weave interface implementation status

5 November 2026. [Weave](https://weave.regencommons.com) is live with real email
sign-in, private initiative saving and loading against the existing Regen Commons
database. The remaining interface is prepared for review. This is a private
account release; Phase 0 still has launch decisions and usability work.

| Step | Change | Review and evidence |
|---|---|---|
| 0 | Placed all 28 review decisions, their owners and open questions | [Approved docs #21](https://github.com/regen-commons/funding-commons/pull/21), [placements](review-decisions.md) |
| 1 | Frame, navigation, footer, cards and list controls | [#22](https://github.com/regen-commons/funding-commons/pull/22), [proof](proof/step-1/) |
| 2 | Home, eight kinds of support, recent and closing-soon sections | [#23](https://github.com/regen-commons/funding-commons/pull/23), [proof](proof/step-2/) |
| 3 | Describe, local sources, assistant choices and Check your card | [#24](https://github.com/regen-commons/funding-commons/pull/24), [proof](proof/step-3/) |
| 4 | Needs, offers and Finish | [#25](https://github.com/regen-commons/funding-commons/pull/25), [proof](proof/step-4/) |
| 5 | Catalog Funding, opportunity detail and team-slot examples | [#26](https://github.com/regen-commons/funding-commons/pull/26), [proof](proof/step-5/) |
| Private accounts | Shared Supabase Auth and owner-only save, load and recovery | [App #27](https://github.com/regen-commons/funding-commons/pull/27), [test fix #28](https://github.com/regen-commons/funding-commons/pull/28), [release record #29](https://github.com/regen-commons/funding-commons/pull/29), [production proof](proof/accounts/README.md) |
| 6 | Partners, Initiatives and the public initiative page | [#30](https://github.com/regen-commons/funding-commons/pull/30), [proof](proof/step-6/) |
| 7 | Contextual email door, sharing, reminder and introduction examples | [#31](https://github.com/regen-commons/funding-commons/pull/31), [proof](proof/step-7/) |
| 8 | In-place Settings, storage facts, assistant record, device export and example deletion | [proof and screenshots](proof/step-8/) |

The prototype's Home, conversation, four-field fallback, checked card, needs,
offers and Finish screens have browser implementations. Keyword drafting runs
locally, including text from readable PDFs. Native speech and the browser model
are offered only when local capability is available. The model download and
cloud consent screens are examples; their live states wait for D32 and D35.
Office files and scanned pages stay attached without claiming their text was read.

Funding uses the catalog and existing fit rubric. Team slots use labelled
structured asks until the steward resolves D29. Partners before sharing shows a
private share card with counts when supplied, never names. Matching after sharing,
public initiative listings and detail with media, offers, needs and previews are
available as examples. A live directory needs the visibility, matching and
content services. Production does not invent counts, media or public records.

Email, code and Saved use the live private account path. The signed-in draft
screen offers explicit Save or Load, backing up the current device draft first
when loading. Field-level merging across devices remains Phase 1. The Share
sheet, fund reminders, introductions and notification choices work in an
in-memory example. Production does not send those messages or publish a card.
Settings, privacy and assistant information work locally; full server export
and account deletion still need services. Example deletion clears only temporary
fictional account state.

The last browser pass checked all 12 app routes at 360, 375 and 1280 pixels in
both themes. The step proof records cover keyboard use, dialog focus, long and
partial data, empty and failure states, and the five-minute reviews. Production
proof used actual Auth and database writes, with Resend's reserved delivery
addresses. Personal inbox delivery and a steward's own sign-in remain to be
checked. A native phone sheet has Close and Escape; drag dismissal still needs
device testing.

## What a person needs to do

1. Independently review [website migration #12](https://github.com/regen-commons/website/pull/12)
   and the interface stack, starting at [#30](https://github.com/regen-commons/funding-commons/pull/30).
   The website migration is already applied; merge its record without reapplying
   it. After each approved interface merge, retarget the next draft to main, check
   its CI and review it before deployment. The subdomain and private account
   services are already configured.
2. Have the shared Auth and email owners check a personal inbox and the steward
   desk. The private release keeps the shared eight-digit, one-hour code and
   existing SMTP; it does not install the proposed email hook. Agree the
   [D14 and D15](../open-decisions.md#for-the-builders) follow-up before changing
   shared settings.
3. Resolve [D26 to D28](../open-decisions.md#for-the-council) for public
   visibility, personalized partners and email actions; D29 to D31 for fund
   requirements, media and retraction. Assign service owners before enabling
   these actions. D33, D34 and D36 still own derived places, visitor Funding and
   conversation follow-up.
4. Test local AI with real participants by **20 November 2026**. The technical
   owner must confirm model quality, licence, bytes, hosting and device behaviour
   under D32. D35 owns per-field consent, region, retention and audit before
   cloud calls. The maker and user representative run the usability round before
   the **30 November 2026** Phase 0 launch.

The plan assumed accounts would wait for Step 7 and used six digits as the
prototype default. The shared project let private saving go live earlier without
another database, with its existing eight digits and one-hour expiry. A same-origin
server route and HttpOnly session cookie removed the need for a browser SDK or
CSP change. The prototype's counts, downloads and email actions were simulations;
they are not evidence of live services or real-user validation.

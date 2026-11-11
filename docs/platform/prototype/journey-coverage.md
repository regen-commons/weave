# Weave journey coverage

Checked on 10 November 2026, after the design branch was rebased onto `develop` at
`0520df8` (PR #36, Certified workspaces and matching). It compares two builds that now
share one codebase:

- **Design**: the example world (`?fixture=`) and the [clickable preview](README.md#the-clickable-preview),
  which run the agreed screens on the example services in `packages/app/src/social`.
- **Live**: the screens wired to the API, checked locally with the `app-fixture` server
  (`WEAVE_ACCOUNT_FIXTURE=1`) and the production pilot off.

Covered means a person can finish the step without help. Partly means it works but
asks too much of them, or one build lacks it.

## Journeys

| Journey and step | Design | Live | Notes |
|---|---|---|---|
| **1. First visit with a Certified project:** sign in | Covered | Covered | Certified is the only door in both. |
| Find or select the project | Covered | Partly | Live lists groups by the end of their identifier, because Certified group names are not returned yet. |
| Link or open its workspace | Covered | Covered | Live opens `/workspaces/:id`; the design opens the initiative page. |
| Add needs and offers | Covered | Covered | Two editors for one task: the needs step and the team entries editor. |
| **2. First visit without a project:** describe the initiative | Covered | Covered | One describe flow, voice first. |
| Explore funding | Covered | Covered | |
| Save privately after Certified sign-in | Covered | Covered | |
| Create a Certified project when ready for partner matching | Covered | Partly | Live asks for a short name for the group's web address before anything else. |
| **3. Returning with a project:** resume the right workspace | Covered | Partly | Home resumes the card on this device only, so team work starts from Your initiatives. |
| Find saved work and matches | Covered | Covered | |
| Manage needs, offers and teammates | Partly | Partly | The design has no teammate screen; live adds teammates by Certified DID. |
| **4. Returning without a linked project:** resume drafts or private saves | Covered | Covered | Device backups before every switch. |
| Continue funding discovery | Covered | Covered | |
| Create or link a project without re-entering work | Covered | Partly | Live has no duplicate prompt (DL-042). |

## Actions

| Action | Design | Live | Notes |
|---|---|---|---|
| Create, save, reload and switch initiatives, keeping unfinished work | Covered | Covered | |
| Add, edit and close needs and offers; review suggested kinds and add or remove several | Covered | Covered | Closing is the Status field in the editor. An entry can be saved privately with no kind; sharing needs one. |
| Save privately, share chosen entries, withdraw, review public publication separately | Covered | Covered | Shares are open-ended: they last until closed or withdrawn. |
| Explore matches, read their evidence, save or hide them, open sources | Covered | Covered | |
| Request a workspace, invite teammates, review invitations, manage access by role | Partly | Partly | Requests work in both. Invitations and roles exist only live, and by DID. |
| Recover from interrupted sign-in, failed saves, conflicting edits, unavailable services and missing permissions | Partly | Covered | The design shows these as example states; live handles each one. |

## Distinctions, where people meet them

| Distinction | Where it shows |
|---|---|
| Certified is the only sign-in | Every door. The live account section keeps an optional email for Certified in a closed disclosure (DL-032). |
| Visitors can draft, browse and get funding | Home, Initiatives and Funding need no account. |
| Linked initiatives get partners from public evidence while their entries stay private | Partners for you, on the initiative and workspace pages. |
| Other teams' shared entries need a linked workspace and one shared entry | One line under Partners for you and in Sharing for matching. |
| Four audiences: only you, your team, people signed in, anyone | The status rows on the initiative page and the sharing and publishing reviews. |
| Confirmed entries versus inferred capabilities and possible fits | Evidence labels: owner-confirmed need or offer, relevant experience, possible use. |
| Viewers versus editors | The live workspace says under its name what the person can do, and viewers see no editing controls. |

## What this round changed

- The design branch now sits on `develop`. Where both changed the same file, the live
  wiring was kept: project directory, team workspace, Certified suggestions, viewer
  read-only states, open-ended sharing and private saves with no kind of support.
- The team workspace is named for its initiative and says in one line what the person
  can do. Its sections use the plain names: What you need, What you can offer, Partners
  for you, Sharing for matching. An open entry no longer carries an "Open" label.
- Live Your initiatives: cards open from their names, the project picker no longer
  shows raw group identifiers, the account section is one line with the rest in a
  disclosure, and a saved card shows no disabled button. It went from about 80 words
  and eight actions to about 50 words and five.
- The group address field has its hint between label and control.

## Documentation conflicts

1. Share length, resolved: `open-decisions.md` called the 90-day cap the preview's
   rule; `develop` made shares open-ended, so the preview follows and the note says so.
2. Entries without a kind of support, resolved: the decision allows a private save with
   none, so the device no longer blocks it.
3. Two sets of screens, open: the design and live screens show the same journeys in
   different shapes. The prompt below asks to converge them.
4. Launch metric, open: the PRD's metric now asks for every lens, six with Learning and
   education (DL-040). The council should confirm.

## Prompt for the backend agent

> The Weave design branch is rebased onto `develop` (`0520df8`) in the pull request
> that adds this file. It keeps your live wiring and adds the second design review,
> native back navigation (DL-041), the Learning and education lens (DL-040) and the
> duplicate prompt (DL-042). Read `docs/platform/prototype/journey-coverage.md` first,
> then `packages/design-system/decision-log.md` DL-033 to DL-042. Keep the production
> pilot off, validate locally with the `app-fixture` server, and run `bun run ci`.
>
> 1. **One set of screens.** The design screens (Your initiatives, Your initiative,
>    and the sharing, publishing and project steps in `src/social`) are the agreed
>    interface. The live screens (`LiveYourInitiatives`, `AccountSection`,
>    `ProjectDirectory`, `TeamWorkspace`, `TeamEntries`, `PublicSupport`,
>    `SavedMatching`) show the same journeys in another shape. Implement the
>    `SocialService` contract in `src/social/fixture.ts`, or an adapter with the same
>    shape, against the live API, so the design screens run in production. Then retire
>    or restyle the parallel live layouts. Keep every viewer rule and recovery state
>    you built. Your initiatives lists "In Weave" (the card on this device, private
>    saves, team workspaces) and "On Certified" (projects not yet in Weave), each card
>    opening from its name. The workspace route renders the initiative page: card first,
>    one status row per open step with one filled button, then Partners for you and
>    Funding that fits.
> 2. **Teammates by handle.** Replace "Teammate's Certified DID" with a Certified
>    handle resolved to a DID on the server. Make an invitation link the default way to
>    add someone. Show pending invitations as a short list with Revoke, and name roles
>    "Can view", "Can edit" and "Manages teammates".
> 3. **Group names.** `list_project_groups` returns only DIDs. Return each group's
>    display name and handle from Certified so the project picker can show names.
> 4. **Duplicate check in production.** When someone is signed in, compare the card's
>    name and links with their Certified projects (`list_projects`), using
>    `src/initiative/duplicates.ts`, at the needs step and beside Save. Link only when
>    the person chooses. Catching duplicates before sign-in needs a public project
>    search; say whether Certified can offer one.
> 5. **Learning lens.** `account-contract.ts` accepts `learning`. Add it wherever else
>    lenses are validated or indexed: matching, the publication Lexicon and the
>    Supabase candidates.
> 6. **Project creation.** Propose the group's web-address name from the initiative
>    name, validate it on the server, and show the field only behind a "Change the
>    address" link.
> 7. **Resume and stale state.** Let Home resume a team workspace as well as the card on
>    this device. When the account no longer has the record the device thinks it saved,
>    say so and offer to save again, instead of showing Saved.
> 8. **Fixtures.** Extend the `app-fixture` server with an admin who has pending
>    invitations, a member who must request a workspace, and a project list. Your
>    initiatives and journeys 1 and 3 can then be checked locally without the hosted
>    bridge, along with the 503 path.
> 9. **Still example only.** Reminders, account deletion (R42) and the suggest-a-fund
>    endpoint need contracts before their screens leave the example world.
>
> Report which journeys run end to end live, what you verified at 360 and 1280 px in
> both themes with the keyboard, and what still waits on Certified or the database.

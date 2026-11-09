# Keeping Funding Commons current

The maintenance workflow proposes changes through draft PRs labeled `automated/codex`. A human reviews and merges each PR. Recurring work does not merge PRs, deploy or promote to production, submit applications, or contact funders. Automatic PR previews and checks follow the existing repository configuration.

Two standalone Codex routines run at 9:00 a.m. Pacific: discovery on Mondays and freshness reviews on Thursdays. Both use **GPT-6 Astra with extra-high reasoning** (`gpt-6-astra`, `xhigh`). Their saved names are **Funding Commons — Monday discovery** and **Funding Commons — Thursday freshness**. The saved prompts identify `/Users/afo/Code/regen/funding-commons` as the working repository. These are local Codex schedules, separate from the website; the computer and app must be running. A missed or failed run must not advance verification dates.

## Monday discovery

Read the latest default branch, open funding PRs, `research/history-intake.json`, `research/discovery-sources.json` and the review log before searching. Continue the historical queue alongside fresh web discovery. Rotate through open-source public goods, climate/restoration, community energy and digital inclusion, and cultural/community education. Include California, Nigeria, Brazil, South Africa and global programs.

The original 94-lead queue has now been reviewed. Use `reviewed` to avoid rediscovering imports and to revisit unresolved leads when new official evidence appears. A `program-directory` or `non-cash-program` disposition is a useful resource, not an unprocessed cash-grant application. New historical leads can enter `pending` without erasing prior dispositions.

Use official calls as evidence. Funding databases, newsletters and older internal notes are discovery leads. Follow a lead to its funder or program owner before importing terms. Record searched sources, dates, results and coverage gaps; do not equate a failed request with no opportunities. A useful run can produce no additions.

Deduplicate at three levels: funder identity, named program, and round. Compare aliases, domains and existing source URLs; parent organizations and similarly named funds are not automatically duplicates. New streams belong under the existing funder when identity is established. A new round must retain the previous round's terms and evidence.

Each proposed program needs an official URL, research date, instrument, application route, applicant/work geography, eligibility and sponsorship conditions, award basis, dates, and explicit unknowns. Store an exact cutoff only when date, time and timezone are established. Separate cash grants, prizes, investments, gas credits and other in-kind support. Program pools are not individual awards.

## Thursday freshness review

First recheck every available dated program closing within 21 days, expected reopening and conditional future calls, and unresolved source conflicts. Then review at least 125 oldest-due program/source records, subject to source access. Use a deterministic order: oldest successful verification, then funder and program ID. Prioritize active routes to target a check within 30 days; closed and source-only records target 90 days. Report uncovered or overdue records if capacity or retrieval failures prevent this. Targets are not a claim of completed coverage.

Keep attempts and successful field verification separate in `research/maintenance-review-log.json`. Record the fields actually checked, evidence URL, outcome, and the next review date. An unchanged source can receive a review-log entry without rewriting historical terms. A failed retrieval records an attempt and leaves the last verified terms intact. A closed round does not mean that the funder has ceased operating.

For a material change, show the previous and proposed values with official evidence. Preserve the previous program/source revision in a dated research archive and cover the change with a preservation check. The current importer appends new programs and rebuilds the snapshot; it does **not** yet provide a general revision store. A freshness PR that changes existing terms must implement or explicitly include the required revision archive, rather than overwriting history silently.

## PR and verification boundary

Use an isolated `codex/` branch or worktree and preserve unrelated changes. Check open PRs to avoid duplicate additions. Reuse an existing PR for the same work. Keep private Drive/Linear captures, application drafts, personal finances, contacts and relationship notes outside this public repository. Publish public official evidence and project-agnostic terms only.

Run `python3 scripts/import-data.py` for catalog changes, then `bun run build`, `bun run test`, and `git diff --check`. Build regenerates the program search index and validates schema, evidence and record coverage. Check that every pre-existing identity and program/source revision is retained. For UI changes, inspect the actual desktop and mobile result, including keyboard access and exact program navigation.

Each run ends with a reviewable draft PR, an explicit no-change result in the coverage log, or a concrete source/tool failure with preserved prior data. Notify the user for a PR ready for review, a material urgent-deadline change, a failed run, or a decision needed. Routine no-change runs stay quiet.

## October 29 historical search

The first historical pass indexed 1,517 unique Drive metadata matches across 36 search pages. It fetched 26 selected Drive documents, including trackers and scout reports, plus two Linear documents and 46 funding issues across four searched workspaces. Archived results were included. The large March conversation archive was indexed for leads, not reviewed line by line. Private captures and saved search cursors remain outside the repository.

The result adds 12 funders/programs, bringing the catalog to 630, and records 94 further program leads in `research/history-intake.json`. These 94 are a verification queue, not confirmed new funders or current calls. Some refer to existing funders with additional streams, program families, or historical rounds. Already represented programs and non-funding categories are recorded separately.

The subsequent [official-source verification pass](../research/history-verification-2026-10-29.md) reviews all 94 leads and imports 87 program entries from 81 of them. The catalog reaches 694 funders, with every prior record and program/source revision retained. Four unresolved leads, four broad program/project resources, four non-cash advisory/fellowship programs and one governance allocation remain outside the application catalog. Imported records also retain unresolved details where only part of the program's terms could be established.

The search is not an exhaustive audit of Drive or Linear. More Drive pages remained, two Linear full-text searches reached their result limit, and every comment, attachment and meeting transcript was not read. Continue from the private coverage ledger when extending the search. The public queue provides a useful starting point even when those private sources are unavailable.

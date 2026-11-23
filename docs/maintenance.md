# Keeping Funding Commons current

Two scheduled routines keep the funder catalog current: discovery on Mondays and a
freshness review on Thursdays. Their workflow lives in the
[catalog-research skill](../.claude/skills/catalog-research/SKILL.md), with its
[search playbook](../.claude/skills/catalog-research/search-playbook.md) and
[verification standard](../.claude/skills/catalog-research/verification-standard.md).
This page covers how the routines are run and what the first historical search did.

## How the routines run

Both are standalone Codex routines saved on the maintainer's computer, set for 9:00
a.m. Pacific with **GPT-6 Astra with extra-high reasoning** (`gpt-6-astra`, `xhigh`).
They are local schedules, separate from the website: the computer and the app must be
running. The text they are saved with is in
[routine prompts](../.claude/skills/catalog-research/routine-prompts.md).

Each run proposes changes through a draft pull request labeled `automated/codex`. A
person reviews and merges it. A routine does not merge, deploy or promote to
production, submit applications or contact funders. A missed or failed run must not
advance verification dates.

## October 29 historical search

The first historical pass indexed 1,517 unique Drive metadata matches across 36 search pages. It fetched 26 selected Drive documents, including trackers and scout reports, plus two Linear documents and 46 funding issues across four searched workspaces. Archived results were included. The large March conversation archive was indexed for leads, not reviewed line by line. Private captures and saved search cursors remain outside the repository.

The result adds 12 funders/programs, bringing the catalog to 630, and records 94 further program leads in `research/history-intake.json`. These 94 are a verification queue, not confirmed new funders or current calls. Some refer to existing funders with additional streams, program families, or historical rounds. Already represented programs and non-funding categories are recorded separately.

The subsequent [official-source verification pass](../research/history-verification-2026-10-29.md) reviews all 94 leads and imports 87 program entries from 81 of them. The catalog reaches 694 funders, with every prior record and program/source revision retained. Four unresolved leads, four broad program/project resources, four non-cash advisory/fellowship programs and one governance allocation remain outside the application catalog. Imported records also retain unresolved details where only part of the program's terms could be established.

The search is not an exhaustive audit of Drive or Linear. More Drive pages remained, two Linear full-text searches reached their result limit, and every comment, attachment and meeting transcript was not read. Continue from the private coverage ledger when extending the search. The public queue provides a useful starting point even when those private sources are unavailable.

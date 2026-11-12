# Weave Preview design handoff

The preview feels overwhelming. There is too much text to read and too many
small actions between arriving with an initiative and adding its needs and
offers. Explain things more simply and let people open the details when they
want to learn more. Explore with Claude how to make the experience more minimal,
intuitive and fluid. The screen structure, number of visible actions and way
of revealing details are open design questions.

## The two starting paths

1. **My initiative is already on Certified.** Sign in with Certified, open or
   select the initiative, then go straight to adding needs and offers. Bring
   over the details we can verify so people do not have to type them again.
2. **I’m starting an initiative.** Sign in with Certified, enter the minimum
   details once, then add needs and offers. Prototype how the owner reviews and
   adds that initiative to Certified without re-entering the same information.
   Make the publication decision clear at that step.

Explore how returning users get back to their initiatives and resume their work.
The existing preview supports Certified sign-in and Weave-owned cards. Selecting
a verified Certified initiative and publishing a new one to Certified still
need integration work. The current build allows Weave-only initiatives, so the
prototype should show where Certified publication fits without assuming that
publishing is a prerequisite for saving privately or using Weave.

## Discuss with Claude

- Walk the existing routes and components in `packages/app`. Identify where the
  interface repeats a decision, asks for information it already has, or makes
  people read background material before they can continue.
- Discuss which actions belong together and which explanations can be shorter
  or available on demand. Keep private saving and explicit sharing understandable
  when the person makes either decision.
- Show how a person can write a need or offer in their own words, then keep or
  adjust the [suggested kinds of support](../open-decisions.md#capital-suggestions-stay-editable).
  People should be able to add or remove several forms without classifying every
  entry from scratch.
- Compare the two starting paths and a returning visit. Use the current code to
  distinguish what works today from changes that need product or integration work.

Read the [design system](../../../DESIGN.md), the [component inventory](../../../packages/design-system/COMPONENTS.md),
and the team's PDF editions of *Don't Make Me Think, Revisited*, *Refactoring UI*
and *Atomic Design*. The repository's [book notes](../../../packages/design-system/principles/README.md)
give page references and explain how the team applies each book. Use these
alongside the implemented code to guide the discussion and prototype.

## Start from the code

Start a design branch from `develop` in `regen-commons/weave` and open the
design pull request back into `develop`. Read `packages/app/src/pages`, `packages/app/src/account`, and
`packages/app/src/partners` for the implemented flows. Start with the existing
app and use the current [Saving and accounts](../08-accounts-and-saving.md) and
[technical spec](../05-technical-spec.md) to check behavior.

Use Bun 1.4.2 and Node 24. From the design checkout, install the locked
dependencies with `bun install --frozen-lockfile`. To explore sign-in, saving
and matching locally with synthetic data, run:

```sh
WEAVE_ACCOUNT_FIXTURE=1 bun run --filter @weave/app dev
```

Open `http://localhost:5173` when that port is available. The fixture is for
design exploration. The remaining hosted checks can resume later.

# Step 6: Partners and public initiatives

5 November 2026. **Fixture proof**, ChatGPT in-app Chromium browser. Production
account verification is recorded separately in [the account proof](../accounts/README.md).

Partners before sharing shows an unknown production count, or a labelled fictional
count in development, with no individual names or reasons. Saved and signed-in
states do not open cards. Shared examples show fit, reasons, Not a fit, a reason
choice and Undo. The public directory remains separate and browsable, with the
Support filter looking in needs, offers or both. Its detail page includes a short
Media banner, work tags, read-only Ask cards, supplied Link previews and an honest
introduction-service boundary. The composition reuses existing patterns; Media's
wide variant uses the existing spacing token.

## Rendered checks

- Checked Partners, Initiatives and public detail at 360, 375 and 1280 pixels in
  light and dark themes. The DOM audit found one h1, no sideways scroll, no text
  below 12 pixels, no unlabelled fields and no checked control below 44 pixels.
  Design-system tests verify contrast in both themes.
- Checked private partner markup for named records: no partner names were present.
  Tested shared-card dismissal and Undo with the keyboard. Browser proof caught a
  stretched card link intercepting Not a fit; the action now uses the Card's raised
  Action bar, and reason/Undo focus follows the action.
- Used Support, Offers and Living: two fictional initiatives remained. Filter
  choices produce removable chips. Checked empty, partial, loading, offline, error
  and long Portuguese content. Public links are supplied data, with no page fetch.
- Opened the design-system Initiatives composition on its pattern server at 360 and
  1280 pixels in both themes. Its appearance chooser permits checking that page in
  place. The same DOM audit passes.
- Five-minute review: heading, next action and fit remain distinct; no new decorative
  label, CSS in the app, raw token or competing primary action. A short banner keeps
  the task visible. Reduced motion uses the existing shared rule. No new motion.

Screenshots: [public detail, desktop light](initiative-desktop-light.jpg),
[public detail, phone dark](initiative-phone-dark.jpg),
[private counts, phone light](private-phone-light.jpg),
[shared partners, desktop dark](partners-desktop-dark.jpg).

## Checks and limits

`bun install --frozen-lockfile`, `bun run ci`, app typecheck and 71 app tests pass.
The full suite passes 310 tests. After the appearance chooser was added to the
static example, all 20 design-system tests passed again. `git diff --check` passes.
The sandbox initially blocked local listening; the HTTP tests and servers passed
with the required local execution permission. No dependencies or lockfile changed.

The production public-directory, partner matching, sharing, approved images and
introduction adapters are not connected. No private initiative is published. D26,
D28, D30 and D31 retain their recorded owners and statuses. Unknown live counts
stay unknown. Step 7 supplies contextual account and development-only action states.

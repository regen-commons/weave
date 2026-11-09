# Step 7: contextual saving and the email door

5 November 2026. **Fixture proof**, ChatGPT in-app Chromium. Live account-service
proof remains in [the account record](../accounts/README.md#production-verification).

The live account panel now works in an explicitly opened native task dialog or
phone bottom sheet, inline on Finish, and in Settings. IDs are unique across
mounted copies. Signing in lists saved cards before Save or Load is chosen; the
existing transactional device backup remains unchanged. No production sharing,
reminder or introduction transport is added.

The separate typed, in-memory example adapter demonstrates the email/code door,
private save, two visibility choices, separate default-off onward sharing, one-fund
reminders and individually confirmed introductions. It never calls account HTTP,
sends email, stores data or publishes an initiative. Production-bundle tests
reject its example labels and identities.

## Browser checks

- Local account HTTP adapter: opened the task without leaving Home, rejected a
  wrong code without losing it, accepted a pasted eight-digit code with spaces,
  listed saved cards before saving, and correctly disabled Save for an incomplete
  device card. No real code was sent during this Step 7 proof.
- The request-code tap focuses Code. Fresh inline panels do not autofocus or scroll
  past first matches. Escape closes the task and returns focus to its invoker.
  Settings and the task mounted together have no duplicate IDs.
- Fixed the initial resend display to start at 60 seconds and retain its deadline
  after closing and reopening the task. Browser proof observed 60, then 57 seconds.
  The provider's authoritative rate limits are unchanged.
- Checked 360, 375 and 1280 pixels in both themes, confirming actual viewport widths.
  One h1, no sideways scroll, no text below 12 pixels, no unlabelled inputs or checked
  target below 44 pixels. Design tests cover contrast. The sticky task header keeps
  Close reachable while scrolling. Pattern-server Code tasks pass at 360 and 1280
  in both themes.
- Completed the example inline code flow. Verification alone did not save. Saving
  kept the private default; public sharing required another choice. Onward sharing
  stayed off. Confirming example sharing opened partner previews.
- Confirmed a specific fund reminder without enabling a weekly update. Confirmed
  an introduction with a note. Team selection covered two asks with two distinct
  recipients, named each once and required a final confirmation. No request was sent.
- Five-minute review: page and next action stay visible, native controls and
  existing tokens carry the task, and repeated actions change to acknowledged
  example states. A browser-found card-link interception is prevented by placing
  actions in Card's raised Action bar. No new motion or dependency.

Screenshots: [phone light](code-phone-light.jpg), [phone dark](code-phone-dark.jpg),
[desktop light](code-desktop-light.jpg), [desktop dark](code-desktop-dark.jpg),
[introduction example](introduction-desktop-dark.jpg).

An independent critical-surface review found no access-control blocker and passed
nine focused account, social and production-exclusion tests. Full checks and CI for
the published revision are recorded in the PR. The API, cookies, Auth and RLS are
unchanged. Native Escape/back and Close are implemented; a custom drag-dismiss
handle remains for device usability review. The contextual private flow retains
an explicit post-code Save/Load choice rather than uploading a competing draft.

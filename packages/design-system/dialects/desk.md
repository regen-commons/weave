---
version: alpha
name: Regen Commons Steward Desk Dialect
description: Rules for the steward desk, a dense working tool on the core system.
extends: ../../DESIGN.md
surface: desk
---

# Steward desk dialect

Stewards use the desk for long stretches, so it is denser and plainer than the app. It keeps its own layouts, and shares tokens now and atoms later.

- **Density is deliberate:** rows 44-56 px, text 14-16 px, base 16 px.
- **Tables:** merge related columns into two-line cells, drop labels the format explains, right-align numbers, and separate rows with space or a faint line. Status is a tag with an icon and a word.
- **Actions:** filled, outlined and link-style buttons as today. Danger fill only on the confirming step, in a dialog with a required reason.
- **Trust:** every steward write shows who, when and why. Stale revisions fail with a plain message that keeps what was typed.
- **Privacy:** stewards never see saved private initiatives. See [08-accounts-and-saving.md](../../../docs/platform/08-accounts-and-saving.md).
- **Theme:** follows the system or the steward's setting.

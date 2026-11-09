# Pinned website tokens

`website-design-tokens.css` is a byte-for-byte copy of `design-tokens.css` from `regen-commons/website` at commit `34aca0c`. Do not edit it. It exists so `test/design-system.test.mjs` can prove that this system keeps every website value.

When the website changes its tokens, copy the new file here and update the commit above. The test then shows what differs. Decide whether [DESIGN.md](../../../DESIGN.md) should follow, and record the decision in the [decision log](../decision-log.md).

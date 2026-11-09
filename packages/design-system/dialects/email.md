---
version: alpha
name: Regen Commons Email Dialect
description: Rules for sign-in, weekly update and membership email.
extends: ../../DESIGN.md
surface: email
---

# Email dialect

Email clients ignore most modern CSS, so email uses table layout and inline styles. Read values from `tokens.generated.json`. Use the light theme values, as the website's membership mail does.

| Use | Token | Value |
|---|---|---|
| Page | `soil-100` | `#EDE5D4` |
| Note box | `soil-200` | `#E0D6C0` |
| Divider | `soil-300` | `#D2C5AA` |
| Headings and buttons | `forest-700` | `#1E3A10` |
| Text | `soil-900` | `#1A1408` |
| Secondary text | `soil-800` | `#4A3E2C` |

- **Layout:** one column, at most 600 px wide. Text at least 16 px, and buttons at least 48 px high. Everything must work with images off.
- **Fonts:** Georgia for titles and reading, Arial for labels. Do not load web fonts.
- **Content:** the subject line states what is inside. Each block has a heading. Every item links to its exact record.
- **Sign-in code:** the code appears in the subject and at the top, in large digits, and is easy to copy. Say what it is for, and link back to the draft, never to the home page. Plain text alternative required.
- **Weekly update:** skip empty weeks. Keep it short. Confirming a record is one tap and names the record. Unsubscribe is visible, and nobody is subscribed by default.
- **Reuse:** the same content contracts as the app's card and reason patterns. Record anywhere email differs from them.

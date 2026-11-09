# Step 8: Settings and your data

5 November 2026. **Fixture proof**, ChatGPT in-app Chromium. The settings page
uses the same account and draft state as Finish. Live account proof is recorded
[separately](../accounts/README.md#production-verification).

- Changed appearance in place. Shared an example privately held initiative,
  enabled its partner notification, then returned it to private. The notification
  reset and the onward-sharing option disappeared. Neither choice published
  anything or sent mail.
- Opened the five storage answers, read the full policy in the same pop-up and
  used Escape to return focus to the opener. Checked the empty assistant record.
  Built a card from a synthetic text attachment and opened Settings through the
  footer. The record showed one completed keyword run, 46 words read and zero
  sent to the cloud.
- Inspected both downloaded JSON files. The device snapshot included synthetic
  source words and the attachment's original bytes as a data URL. The assistant
  record included only run metadata and no source text. Tests cover attachments
  at all three steps, backups and a failed file read.
- Cleared the fictional account from its confirmation sheet. The device card
  stayed; the example save badge, choices and delete button reset. On the local
  account HTTP adapter, signed in with the reserved fixture code and used Enter
  on Sign out under Leave. The account ended and the existing device draft and
  backups remained.
- Checked all 12 app routes at 360, 375 and 1280 pixels in both themes (72
  combinations), confirming actual viewport width and theme. Each had one h1,
  no sideways scroll, no visible text below 12 pixels, no unlabelled inputs
  and no checked action target below 44 pixels. The Settings pattern passed
  the same checks at 360 and 1280 in both themes. Design checks cover token
  contrast; this is not an exhaustive contrast audit of every transient state.

Five-minute review: each page has a clear heading and an available next action
or a reason to wait. Settings keeps choices where they are shown, with Leave
last and membership in the footer. Native controls, explicit confirmations,
the existing tokens and keyboard focus keep the tasks understandable. No
new motion is needed. Service-dependent controls stay in labelled examples.

Screenshots: [desktop Settings](settings-desktop-light.jpg),
[phone Settings](settings-phone-dark.jpg), [phone policy](policy-phone-light.jpg),
[assistant record](assistant-desktop-dark.jpg).

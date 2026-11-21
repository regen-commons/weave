# Talking through the browser's own speech service

Checked on 19 November 2026 for [Browser speech service, 19 November 2026](../../../open-decisions.md#browser-speech-service-19-november-2026)
and [DL-115](../../../../../packages/design-system/decision-log.md#dl-115-talk-it-out-reaches-more-browsers-through-their-own-speech-service-after-the-person-agrees).
Two proof classes, kept apart. No screenshots are committed; the captures were looked at during the check.

- **Fixture, HeadlessChrome 149** (Chromium through Chrome DevTools, macOS arm64), with the example
  browser from `?speech=` standing in for each browser. Nothing was recorded or sent.
- **Real browser answer, local dev server, HeadlessChrome 149, no fixture.** The browser's own
  answers and its real recognizer, with the page's language set to Swahili.

## Real browser answer

- `SpeechRecognition` exists with `processLocally`. `available({ processLocally: true })` answered
  `"downloadable"` for `en-US` and `"unavailable"` for `sw-KE`.
- For English the page offered Set Up Speech On This Device, as before: the browser's service is
  not offered where speech on the device can be set up.
- For Swahili the page offered Talk It Out with "Your browser's speech service turns your voice
  into text." The first press opened Use Your Browser's Speech Service?, and nothing was stored
  until Agree And Talk It Out. Then `localStorage` held the agreement, the real recognizer started
  and reported `not-allowed`, because headless Chrome has no microphone permission. The status line
  said "Your browser did not allow the microphone here. Your words are still here, and you can type
  in the box.", Talk It Out stayed, and the focus stayed on it.

## Fixtures

Every `?speech=` example on Describe (`/start/initiative?fixture=visitor`) and on needs and offers
(`/start/needs?fixture=draft&intake=empty`), swept by script at 360 px dark with touch emulated
and at 1280 px light, with captures also at 360 px light (the keyboard line) and 1280 px dark
(Settings):

| Example | Beside the button | After pressing Talk It Out |
|---|---|---|
| `ready` | Speaking In American English | Stop, "Listening on this device. Audio is not sent to a server." |
| `browser` | "Your browser's speech service turns your voice into text." | The notice opens; focus on Close |
| `agreed` | Speaking In American English | Stop, "Listening. Your browser's speech service turns your voice into text." |
| `denied` | Same | Status: did not allow the microphone |
| `no-mic` | Same | Status: could not use a microphone |
| `network` | Same | Status: could not be reached, and on a touch screen the keyboard's microphone key |
| `blocked` | Same | Status: does not work here, and on a touch screen the keyboard's microphone key |
| `pause` | Same | Status: "Listening stopped after a pause." The fields are not filled |
| `unsupported` | Same | Status: speech for this language is not available |
| `none` | "This browser cannot turn speech into text here." on a computer; the keyboard line on a touch screen | No button |
| `keyboard` | "If your keyboard has a microphone key, you can use it to talk into the box." | No button |

- In every case the box under the button stayed where it was when Talk It Out was pressed (0 px),
  focus stayed on the button or moved to Stop in its place, and nothing overflowed at 360 px.
- With the keyboard: Enter on Talk It Out opens the notice with focus on Close; Tab reaches Agree
  And Talk It Out; Enter starts listening with focus on Stop; Escape closes the notice, returns focus
  to Talk It Out and starts nothing.
- The example agreement is held in memory. The browser's real stored agreement stayed empty
  throughout the fixture checks.
- Settings, Speech, at 1280 px dark: with an agreement stored, it says so and offers Stop Using
  Browser Speech. Enter on it removed the stored agreement, removed the button, and moved focus to
  the line, which then says Weave asks before using the browser's speech service.

Two problems the first render found, both fixed before this record: the line and the language
choice together made the browser's controls taller than while listening, so on a phone the box
moved up 40 px on Talk It Out; and a "does not work here" or "language not taken" error took the
button away, which moved the box up to 96 px and dropped the focus to the page.

## Not proven

The runs above used headless Chrome. They show the page's logic and wording, not how a real phone,
microphone or speech service behaves. The device checklist below is for the owner's own devices.
One question about the production headers sits beside it.

- **Content Security Policy and microphone permission.** Checked on 21 November 2026 at 07:10 UTC,
  on production, from a fetch of `https://weave.regencommons.com/start/initiative`. There is no
  `Permissions-Policy` header, so the microphone falls back to the browser default: allowed for the
  page's own origin, at the top level. The `Content-Security-Policy` is `default-src 'self';
  script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self';
  worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'`. `connect-src 'self'` governs the page's own fetch, XHR and WebSocket
  connections. The Web Speech API's recognizer connects from the browser itself, so on the face of
  it nothing blocks it. That is not proven on a device: see check 13. The dev server sends no CSP,
  so the runs above could not show it either.

## Device checklist

Run these on production, `https://weave.regencommons.com/start/initiative`. A real run is
production proof, so write the browser, its version and the operating system in each result. The
result fields start empty on purpose.

Before each check, use a private tab or clear the site's data, so no agreement is stored. Talk It
Out follows the browser's language. If the page offers Set Up Speech On This Device, or says
"Listening on this device", that browser has speech on the device and the browser's own speech
service was not reached. Write that down.

**The usual fallback** is what checks 1 to 5 expect when the browser's own speech service runs:

- Beside Talk It Out: "Your browser's speech service turns your voice into text."
- The first press opens the notice Use Your Browser's Speech Service? with Agree And Talk It Out and
  Not Now. The microphone prompt comes after Agree And Talk It Out, not before.
- While it listens, the button reads Stop, the status reads "Listening. Your browser's speech
  service turns your voice into text.", the box is labeled Listening and your words appear in it.
- A session that ends by itself says "Listening stopped after a pause. Your words are in the box.
  Press Talk It Out to say more." With nothing heard, it says "Listening stopped after a pause.
  Press Talk It Out to try again, or type in the box." Weave never restarts listening on its own.

### 1. Safari on iPhone

- **Steps:** Open the page. Press Talk It Out, read the notice, press Agree And Talk It Out and allow
  the microphone. Say one sentence, then stay quiet for 10 seconds. Do this three times.
- **Expect:** The usual fallback. Write down whether the session ended after each phrase. If Safari
  asks you to turn on Dictation or Siri, or the status starts "Your browser's speech service does
  not work here.", write down exactly what showed.
- **Result:**

### 2. Safari on Mac

- **Steps:** The same as 1, with the web console open from before you press Talk It Out.
- **Expect:** The usual fallback, and no keyboard line, because a Mac is not a touch screen. Write
  down whether the session ended after each phrase.
- **Result:**

### 3. Chrome on Android

- **Steps:** Open the page. Press Talk It Out, agree and allow the microphone. Then try five times:
  say one phrase, stay quiet for 10 seconds, and press Stop if it is still listening.
- **Expect:** The usual fallback. Chrome on Android ignores `continuous`, so sessions may end by
  themselves. Write down how many of the five ended by themselves, how long after you stopped
  speaking, and whether the words were kept each time.
- **Result:**

### 4. Samsung Internet

- **Steps:** The same as 3.
- **Expect:** The same as 3.
- **Result:**

### 5. Edge on a computer

- **Steps:** Open the page with the console open. Press Talk It Out. If the notice opens, agree,
  allow the microphone and say two sentences.
- **Expect:** The usual fallback if Edge has no speech on the device. Edge sends the audio to a
  Microsoft service, and the notice names no company. If the page offers Set Up Speech On This
  Device instead, write that down.
- **Result:**

### 6. Brave, on a computer and on Android

- **Steps:** Open the page. Press Talk It Out, agree, allow the microphone and say a sentence.
- **Expect:** Brave's recognizer has no speech service, so the session should fail with a status
  line and no transcript. Write down which status it is, word for word. The page can say "Your
  browser's speech service could not be reached." (`network`), "Your browser's speech service does
  not work here." (`service-not-allowed`), or "The microphone could not continue. Your words are
  still here, and you can type in the box." (any other error). On Android, the first two add "If
  your keyboard has a microphone key, you can use it, or type in the box." Talk It Out should stay
  where it was and try again when pressed.
- **Result:**

### 7. Firefox on Android

- **Steps:** Open the page and look where Talk It Out would be.
- **Expect:** No Talk It Out button. The line reads "If your keyboard has a microphone key, you can
  use it to talk into the box." and the box is labeled "A few sentences about your initiative". If
  a button shows, write down the version and what it did.
- **Result:**

### 8. Firefox on a computer, version 160 or later

- **Steps:** Open the page, press what is offered and follow it.
- **Expect:** Not known. MDN lists on-device recognition from 160. Write down which of these
  showed: Talk It Out with "Listening on this device. Audio is not sent to a server." while it
  listens; Set Up Speech On This Device; the usual fallback; or "This browser cannot turn speech
  into text here. You can type instead."
- **Result:**

### 9. The keyboard's microphone key: iPhone keyboard and Gboard

- **Steps:** Tap in the box on the Describe page. Tap the keyboard's microphone key, say two
  sentences and tap it again. Then press Fill In The Fields. Do this on an iPhone in Safari, and
  with Gboard in Firefox on Android, where the page has no button.
- **Expect:** The words land in the box like typed text. The page shows no listening state and no
  status, and Fill In The Fields is available once there are words. Write down the keyboard and
  whether the key was there at all.
- **Result:**

### 10. The consent notice

- **Steps:** In a private window on a computer (Safari on Mac or Edge), open the browser's storage
  view for the site. Press Talk It Out. Close the notice with Escape, open it again and press Close,
  open it again and press Not Now. After each, look at the storage and watch for a microphone
  prompt. Then press Agree And Talk It Out, and reload. On a phone you cannot see storage: after
  each way of closing, reload and press Talk It Out.
- **Expect:** Nothing stored and no microphone prompt before Agree And Talk It Out. Escape, Close
  and Not Now each close the notice and start nothing, and the notice opens again after a reload.
  Escape returns focus to Talk It Out; for Close and Not Now, write down where focus lands. After
  Agree And Talk It Out the key `weave-browser-speech` reads `agreed`, the microphone prompt comes
  and listening starts. After a reload, Talk It Out starts without the notice.
- **Result:**

### 11. Withdrawing consent

- **Steps:** After check 10, open Settings (`/settings`, or the You tab on a phone) and find Speech.
  Press Stop Using Browser Speech. Go back to the Describe page and press Talk It Out. Optional, on
  a computer: start listening in one tab and withdraw in a second tab.
- **Expect:** Before, the Speech line reads "Where speech on this device is not available, your
  browser's speech service turns your voice into text. Weave does not receive the audio." with Stop
  Using Browser Speech under it. After, the button is gone, focus is on the line, and the line reads
  "Talking uses speech on this device where your browser offers it. Anywhere else, Weave asks before
  using your browser's speech service." On the Describe page the line beside Talk It Out is back to
  "Your browser's speech service turns your voice into text." and the first press opens the notice
  again. In the optional test, the first tab stops listening and says "Browser speech was turned off
  in Settings. Your words are still here, and you can type in the box."
- **Result:**

### 12. A screen reader

- **Steps:** VoiceOver on iPhone (Safari) or Mac, TalkBack on Android (Chrome). Go to Talk It Out and
  press it, move through the notice, press Agree And Talk It Out, listen while it listens and after
  Stop. Then refuse the microphone once to hear an error status.
- **Expect:** Nothing fixed. Write down what is said and what is missing. The notice is a modal
  dialog: is its title read when it opens, where does focus land, can all three paragraphs be
  reached? The lines beside the button and under the box are status regions: are "Listening. Your
  browser's speech service turns your voice into text." and the error line announced without moving
  focus? How is Stop announced, since it carries a pressed state?
- **Result:**

### 13. Content Security Policy and microphone permission

- **Steps:** In checks 2 and 5 (Safari on Mac, Edge), keep the console open from before you press
  Talk It Out until you stop. Note whether any run, phones included, got a transcript.
- **Expect:** The microphone prompt names the page's own origin, a transcript arrives, and the
  console shows no message about a blocked connection or the Content Security Policy. A transcript
  on any production run already shows the policy does not block the browser's speech service; the
  console says why if one does.
- **Result:**

### 14. Speech quality

- **Steps:** In every run that gives a transcript, say the same three sentences: "We run a seed
  library for our neighbourhood. We need money for a shed and a part-time coordinator. We can offer
  free workshops."
- **Expect:** Nothing fixed. Per browser, write down how many of the three came out right, which
  words went wrong (names, numbers), whether capitals and punctuation appear, and whether words show
  while you speak.

| Browser | Sentences right (of 3) | Wrong words, punctuation, delay |
|---|---|---|
| Safari on iPhone | | |
| Safari on Mac | | |
| Chrome on Android | | |
| Samsung Internet | | |
| Edge | | |
| Firefox on a computer | | |

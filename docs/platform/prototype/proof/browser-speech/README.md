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

These need the owner's QA on real devices:

- Safari on an iPhone and on a Mac: the notice, the microphone prompt, a real transcript, and
  whether a session ends after each phrase.
- Chrome on Android and Samsung Internet: a real transcript, and how often a session ends by
  itself, since Chrome on Android ignores `continuous`.
- Edge, which sends the audio to a Microsoft service, and Brave, whose recognizer has no speech
  service: which error Brave reports.
- Firefox on Android showing the keyboard line, and Firefox on a computer from version 160, which
  MDN lists with on-device recognition.
- The keyboard's own microphone key on an iPhone and with Gboard.
- That the production Content Security Policy does not block the browser's own speech service.
  The dev server sends no CSP, and no primary source says either way; the service is the
  browser's own connection, not the page's.
- Speech quality, and how a screen reader announces the notice and the status lines.

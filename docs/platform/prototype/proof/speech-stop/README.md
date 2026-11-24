# Speech: Stop never ends in silence

Checked on 23 November 2026 for the revision of
[DL-133](../../../../../packages/design-system/decision-log.md#dl-133-stop-answers-at-once-and-the-wait-for-the-last-words-has-an-end),
after a report from production: "after I clicked stop nothing was transcribed or showed with no
clear error". No screenshots are committed; the captures were looked at during the check and
sent with the hand-over.

## Proof class

**Local production build, scripted recognizer, HeadlessChrome 159** (Chrome for Testing
159.0.8154.6, macOS arm64), driven with Playwright. The build of `main` at `12d8144` is what
production ran when the report came in; the fixed build is this branch. A scripted
`SpeechRecognition` stands in for the browser's, so the replays prove what the page does with
each way a recognizer can behave, not how a real recognizer behaves. Cloud speech used the
browser's fake microphone and an answered `/api/transcribe`; nothing went to Cloudflare.

Two real recognizers were also started on this computer with a throwaway profile and the fake
microphone, which plays a tone and no words:

- Chromium 159's own speech service started, heard audio, and after `stop()` ended with no words
  and no error. The page took that as nothing to say.
- Brave 156's ended with `network` at once, which the page already reports.

No Google Chrome, Firefox or real phone was available here.

## What production showed

`GET /api/transcribe` answers `{"enabled":true,"maxSeconds":180,"maxBytes":3000000}`. The
production request log from 23:31 UTC to 02:30 UTC (the plan keeps 12 hours) shows only
Chromium-based browsers on the describe steps, and no recording sent to `/api/transcribe`. So the
report came from a browser's own recognizer, not from cloud speech. The firewall rule and the
limits added for `/api/mcp` do not touch `/api/transcribe`.

## Replays, before and after

Step 1 (`/start/initiative`), 1280 wide. "Box" is the words in the box after Stop, "line" the
status line under it.

| Recognizer | `main` at `12d8144` | This branch |
|---|---|---|
| Words while talking, last words just after Stop | Box and fields filled | Same |
| Nothing while talking, every word 4 s after Stop | Box empty, line unchanged: the session was ended at 2.5 s and the words thrown away | Finishing until the words come, then box and fields filled |
| Nothing at all, ends after Stop with no error | Box empty, line unchanged | "No speech was heard. Check your microphone and try again, or type in the box." |
| Cloud speech, Stop while the browser still asks about the microphone | Line unchanged, nothing sent | "The microphone was not ready, so nothing was recorded or sent. Try again, or type in the box." |
| Cloud speech, provider fails | "The recording could not be turned into text..." | Same |

Needs and Offers had the same loss: on `main` the words given 4 s after Stop were thrown away and
the line said "No speech was heard" although the person had spoken. On this branch they make a
card ("1 need added", "1 offer added").

## Rendered check

Step 1 at 360 by 780 and 1280 by 900, light and dark, started and stopped with the keyboard
(Enter on Talk It Out, Enter on Stop), with a video of each run:

- Listening: Stop, "Listening on this device. Audio is not sent to a server."
- Just after Stop: Finishing, "Finishing your words.", focus on the button.
- After the late words: Talk It Out again with the focus, the box and the three fields filled,
  "Filled Name, Where you work and About it. Check and change anything."
- A forced failure: the no-speech line above, focus on Talk It Out.

Also at 360 and 1280, light: words while talking, cloud speech stopped before the microphone was
ready, and Needs with late words.

## Not proven

- Which recognizer the reporter used, and why it gave no words in time. Their browser and device
  were not known when this was written.
- How long a real recognizer takes after Stop. Ten seconds is a bound chosen to keep the words of a
  slow phone or a far speech service, not a measured one.

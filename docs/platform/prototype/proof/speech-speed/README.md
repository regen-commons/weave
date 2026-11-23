# Speech speed: where the time goes, and Stop answering at once

Checked on 22 November 2026 for
[DL-133](../../../../../packages/design-system/decision-log.md#dl-133-stop-answers-at-once-and-the-wait-for-the-last-words-has-an-end),
on a branch from `develop` at `32aade5`. No screenshots are committed; the captures were looked
at during the check.

## What was measured, and what was not

One proof class throughout: **local production build, replayed recognizer, HeadlessChrome 159**
(Chrome for Testing 159.0.8154.6, macOS arm64), driven through the DevTools protocol.

Talk It Out is the browser's Web Speech API. Weave has no speech worker, downloads no model and
records no audio, so there is no model download, cache or worker start of Weave's own to time. The
recognizer belongs to the browser, and a real one could not be run here: Google's update server
gives Chrome for Testing no on-device speech pack (`SpeechRecognition.available()` answered
`"downloading"` and never changed, with the `SODA` folders left empty), Chrome for Testing has no
key for Google's speech service, and this computer has no Google Chrome.

So a scripted `SpeechRecognition` stood in for the browser's. It says an 84-word passage at 165
words a minute, gives an interim result every 150 ms and a final result 300 ms after each
sentence, and after `stop()` gives its last final result and `end` 600 ms later. That measures the
page's own share exactly and says nothing about how fast a real recognizer is. The processor was
slowed four and six times for the phone runs, at 360 by 780. The computer was under heavy load
from other work during every run, so the absolute times are high and the comparisons are what
count.

## Stop

Time from the Stop press to the first change a person can see, with a recognizer that ends 600 ms
after `stop()`:

| Processor | Before | After |
|---|---|---|
| Desktop speed, 1280 wide | 621 ms | 7 ms, and 11 ms in a second run |
| Slowed 4 times, 360 wide | 627 ms | 2 ms |
| Slowed 6 times, 360 wide | 632 ms | 6 ms |

Before, the page changed nothing until the recognizer's `end`, and added about 20 to 30 ms of its
own. Now the button reads Finishing in the frame after the press.

A recognizer that never ends: the earlier code had no time limit, so the page kept listening. That
case was read from the code, not run. With the change, the session was let go 2.51 s after Stop in
both runs, the page went on to fill the fields, and the box held all 51 words heard so far,
including the phrase that was not final yet.

## After the recognizer ends

The fields changed 0.25 to 1.0 s after the recognizer's end in most runs, and up to 6 s in runs
under the heaviest load. That time is the fill, which this change does not touch:

- 88 to 797 ms waiting for `LanguageModel.availability()` before the keyword rules start.
- 222 to 736 ms from `new Worker` for the keyword rules to its answer. The worker is made new for
  every fill, and its module is 140 kB.

Both belong to the describe step's files and are passed on to that work.

## While listening

| Processor | Results heard | Main thread busy | Longest task |
|---|---|---|---|
| Desktop speed | 207 | 6.1% | 114 ms, three long tasks in 37 s |
| Slowed 4 times | 207 | 18.2% | none over 50 ms |
| Slowed 6 times | 207 | 28.4% | 55 ms, one long task |

Each result costs about 11 ms of main thread at desktop speed and 47 ms slowed six times: the
page parses the draft, renders the step and writes the draft to storage. Slowed six times, a
result every 450 ms took 18.1% and final results alone 10.1%, which is the page at rest. Showing
the words as they come is therefore not what makes speech feel slow, and it was left as it is.

## The words are the same

On the same replayed passage the box held the same 84 words before and after the change, equal to
the passage word for word. A replayed recognizer cannot show recognition quality; this shows the
change loses no word the recognizer gives.

## Rendered states, with the keyboard only

`/start/initiative` with no fixture, at 360 and 1280 wide, light and dark, four runs. Tab reached
Talk It Out in four presses on a phone and five on a wide screen. Enter started listening, Enter
again pressed Stop, and a third Enter was pressed while it finished. In all four runs:

| Step | Button | Line beside it | Box label |
|---|---|---|---|
| Resting | Talk It Out | the language choice | What you said, or type a few sentences |
| Listening | Stop, pressed | Listening on this device. Audio is not sent to a server. | Listening |
| After Stop | Finishing, with a Spinner, busy | Finishing your words. | What you said, or type a few sentences |
| Recognizer ended, fields filling | Talk It Out, held | the language choice | the same |
| Filled | Talk It Out | the language choice | the same |

- The focus stayed on the button through every step.
- The button and the box did not move, and nothing overflowed at 360.
- The recognizer was asked to stop once. The press during Finishing did nothing.
- The box stayed read-only until the recognizer ended.

**What a screen reader is told.** Both lines are polite status regions. Their text changed in
this order: "Listening on this device. Audio is not sent to a server.", then "Finishing your
words." 50 to 93 ms after the press, then "Reading your words on this device." when the
recognizer ended, then "Filled Name and About it. Add where you work below." The button's own
name changes from Stop to Finishing while it has the focus, and it is marked busy. This is the
text the regions held, read from the page. It was not listened to in VoiceOver, TalkBack or NVDA.

## Not proven

- **A real recognizer.** How long Chrome's on-device speech, Safari's or Android's take to end
  after Stop is not known from this check, so 2.5 seconds is a careful guess and not a measured
  limit. Whether a session can end early when the person has already paused depends on the same
  numbers and was left out.
- **A real phone.** A slowed desktop processor is not a phone.
- **A screen reader's speech**, as above.

To read real times on any device after a session, in the browser's console:

```js
performance.getEntriesByType("measure").filter((entry) => entry.name.startsWith("weave-speech"))
```

`weave-speech-first-words` runs from the start to the first words heard, and `weave-speech-stop`
from Stop to the recognizer's end. The entries stay in the browser.

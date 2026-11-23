# Cloud speech: a recording turned into text where the browser cannot

Checked on 23 November 2026 for
[Cloud speech, 23 November 2026](../../../open-decisions.md#cloud-speech-23-november-2026) and
[DL-138](../../../../../packages/design-system/decision-log.md#dl-138-where-a-browser-cannot-turn-speech-into-text-a-recording-can-be-sent-after-the-person-agrees).
No screenshots are committed; the captures were looked at during the check.

## What was run, and what was not

- **Local dev server with the synthetic provider, HeadlessChrome 159, fake microphone.** Chrome for
  Testing 159.0.8154.6 on macOS arm64, with `SpeechRecognition` removed from the page so it stands
  in for a browser with no speech recognition, a WAV file as its microphone, the browser's real
  `getUserMedia` and `MediaRecorder`, and the dev server started with
  `WEAVE_CLOUD_SPEECH_FIXTURE=true`, so `/api/transcribe` answered with fixed words and called
  nothing. No audio left the computer.
- **Unit tests**, for every refusal and failure.
- **Not run: a real call to Cloudflare.** There is no account or token yet, so nothing here shows
  a real recording becoming real words.

An independent review of the first version found seven defects in the recording session and in
what the page said at the time limit, during the microphone question and after a withdrawal.
They are fixed, each has a test, and the runs below are of the fixed version.

## The flow, with the keyboard only

`/start/initiative` with no fixture, at 360 and 1280 wide, light and dark, with reduced motion
set. Without it, headless Chrome does not finish a dialog's leaving motion after Escape and the
dialog closes without telling the page; in the app's own browser pane (fixture, `?speech=cloud`)
Escape closed the notice, it opened again on the next press, and nothing was stored. Tab reached
Talk It Out in four presses on a phone and five on a wide screen.

| Step | Button | Line beside it | Box label | Stored agreement |
|---|---|---|---|---|
| Page opens | Talk It Out | Weave can turn a recording of your voice into text with Cloudflare. It asks first. | What you said, or type a few sentences | none |
| Enter | the same | the same | the same | none; the notice is open with focus on Close |
| Escape | the same, with the focus back on it | the same | the same | none |
| Enter, Tab to Agree And Record, Enter | Stop | Waiting for the microphone. Nothing is recorded yet. | Waiting for the microphone | agreed |
| The browser opens the microphone | Stop | Recording. Nothing is sent yet. With Discard beside it | Recording 0:00 of 3:00, counting each second | agreed |
| Enter | Finishing, with a Spinner, busy | Sending your recording to Cloudflare to be turned into text. | What you said, or type a few sentences | agreed |
| Words back | Talk It Out | the language choice | the same | agreed |

- The focus stayed on the button from the agreement to the end. The button and the box did not
  move, and nothing overflowed at 360.
- The box stayed read-only until the words came back, then held them, and the fields filled:
  "Filled Name, Where you work and About it. Check and change anything."
- **What the page sent.** One `GET /api/transcribe` as the page opened, and one
  `POST /api/transcribe` after Stop with `Content-Type: audio/webm`,
  `x-weave-speech-agreement: cloud` and `x-weave-speech-language: en-US`. Nothing was sent
  before Stop, and no request went to any other origin.
- **Discard**, at 360 light and 1280 dark: Tab from Stop landed on Discard, and Enter dropped the
  recording. The line under the box said "The recording was discarded. Nothing was sent. Press
  Talk It Out to try again, or type in the box.", the focus went back to Talk It Out, the box did
  not move, and no `POST` was made.
- **What a screen reader is told.** The polite line beside the button changed in this order:
  "Waiting for the microphone. Nothing is recorded yet.", "Recording. Nothing is sent yet.",
  "Sending your recording to Cloudflare to be turned into text.", and
  then the line under the box said "Reading your words on this device." and what was filled. The
  counting label is not a live region, so the seconds are not read out. This is the text the
  regions held; it was not listened to in a screen reader.

In the fake browser the microphone took between 0.3 and 6 seconds to open on a loaded computer,
which is why the page says it is waiting until recording has begun.

## Settings

`/settings` with the agreement stored and two recordings noted, at 360 and 1280, light and dark,
keyboard only. The Speech section said "Where this browser cannot turn speech into text, Weave
sends your recording to Cloudflare Workers AI to turn it into text. Weave does not keep it." and
"This device has sent 2 recordings to be turned into text, the last on 23 November 2026." Tab reached Stop
Using Cloud Speech. Enter removed the stored agreement and the button, moved the focus to the
status line, which then read "Talking uses speech on this device where your browser offers it.
Anywhere else, Weave asks before your voice leaves this device.", and left the count in place.

## What the tests hold

`packages/api/src/transcribe.test.ts` and `packages/app/test/cloud-speech.test.ts`:

- Nothing reaches the provider from another site, without the agreement header, as anything but
  audio, over 3 MB, with a malformed language, too slowly, or while cloud speech is off, in which
  case the recording is not even read.
- Each way Cloudflare refuses becomes one stable code, and its own message never reaches the
  browser. A hung or unreachable provider ends cleanly. The token is sent in a header only.
- It stays off without `WEAVE_CLOUD_SPEECH_ENABLED=true` and a well-formed account and token.
  The synthetic provider never answers on a deployment.
- The page records nothing and does not ask for the microphone without the agreement. Withdrawing
  it stops a recording and sends nothing, and cancels a recording already on its way.
- A recording is sent once, whole, with the language, no cookie and nothing else, and is never
  tried a second time. Discard, a withdrawn agreement and leaving the page drop it unsent.
- The session ends once whatever happens: Stop before the microphone opens, the time limit, a
  recorder that stops by itself or never reports that it stopped, and a page that fails on the
  words. The device counts a recording only when it left the device.
- Every way it stops says what happened, that the recording was not kept, and that typing works.
- The two agreements are stored apart. `test/privacy.test.ts` fails if any module but
  `speech-cloud.ts` records, if that module stores anything, or if the server gains a second
  outbound address or a log line.

## Not proven

- **Cloudflare itself.** No request has reached it. Its model page documents `audio` as a base64
  string and names no audio format, so whether it takes WebM with Opus from Chrome and Firefox and
  MP4 with AAC from Safari must be tried with the account.
- **Quality.** How well Whisper turns each language into text, Swahili above all. Cloudflare
  publishes no figure for any language.
- **A real phone, Firefox and Safari.** Only headless Chrome with its speech recognition removed
  was run.
- **A deployed function.** `/api/transcribe` has not answered from a Vercel preview with the
  secrets set. Vercel's 4.5 MB request limit is why one recording is capped at 3 MB.
- **A screen reader's speech.**

## Switching it on

Three settings in the Weave Vercel project, and nothing else:

| Setting | Value |
|---|---|
| `WEAVE_CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account's ID, 32 hex characters |
| `WEAVE_CLOUDFLARE_AI_TOKEN` | An API token made from Cloudflare's "Workers AI" template |
| `WEAVE_CLOUD_SPEECH_ENABLED` | `true` |

Staying on Cloudflare's Workers Free plan makes the daily allowance (10,000 neurons, about 214
minutes of audio) a hard stop that costs nothing: past it Cloudflare refuses, and the page says
cloud speech has reached its limit for today. On the Paid plan the same use is billed at
$0.0005 a minute with no stop, so a rate limit on `/api/transcribe` in Vercel's firewall should
come first.

Then, on production in Firefox on a computer and on Android, with site data cleared:

1. Open `/start/initiative`. Expect Talk It Out and the line that names Cloudflare.
2. Press it, read the notice, press Agree And Record and allow the microphone.
3. Say two sentences in English, press Stop, and check the words and the fields.
4. Repeat in Portuguese and in Swahili, choosing the language first. Write down what came back.
5. Open Settings. Expect the count of recordings, and Stop Using Cloud Speech.

## Providers compared

Checked on 22 and 23 November 2026 from each provider's own pages. Cost assumes 3,000 minutes a
month.

| Option | Price | Kept after processing | Used for training | Where | Cost a month |
|---|---|---|---|---|---|
| **Cloudflare Workers AI, Whisper large-v3-turbo (chosen)** | $0.0005 a minute; about 214 free minutes a day | Nothing, by default | No, by default | Cloudflare's network; no region can be promised | $1.50, likely nothing |
| Deepgram Nova-3, EU endpoint | $0.0043 to $0.0052 a minute | Kept unless every request opts out | Yes unless opted out | EU only | $13 to $16 |
| Groq, Whisper large-v3-turbo | $0.04 an hour | Nothing with its setting on | No | United States only | $2 |
| OpenAI `gpt-transcribe` | $0.0045 a minute | Not kept by default | No | EU by sales agreement | $13.50 |
| AssemblyAI, EU endpoint | $0.15 to $0.30 an hour | Nothing on the sync API once opted out | Opt-out | EU endpoint | $8 to $15 |
| ElevenLabs Scribe | $0.20 an hour | Zero retention is Enterprise only | On by default | EU is Enterprise only | $10 |
| Vercel AI Gateway (resells the models above) | The providers' list prices | Its zero data retention does not cover transcription models | Not stated for transcription | EU endpoint in beta, 5% extra | $5 to $18 |

Sources: [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/),
[data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/),
[errors](https://developers.cloudflare.com/workers-ai/platform/errors/) and
[the model](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/);
[Deepgram](https://developers.deepgram.com/docs/data-privacy-compliance);
[Groq](https://console.groq.com/docs/your-data);
[OpenAI](https://developers.openai.com/api/docs/guides/your-data);
[AssemblyAI](https://www.assemblyai.com/docs/faq/how-long-do-you-store-my-data);
[ElevenLabs](https://elevenlabs.io/docs/resources/zero-retention-mode);
[Vercel AI Gateway](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr);
[Vercel function limits](https://vercel.com/docs/functions/limitations).

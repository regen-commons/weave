# Speech evaluation

This measures how well cloud speech turns a person's voice into the words Weave reads:
the word error rate (WER) of `/api/transcribe`, which sends a recording to Cloudflare
Workers AI (Whisper), on clips of people describing an initiative and listing what they
need and offer. Every call reaches Cloudflare and counts against the day's allowance,
so nothing here runs on a push. It runs by hand, or from the manual **Speech
evaluation** workflow.

**There are no real clips yet.** Real clips need people to record them, as set out
below. Until then, synthetic clips made with macOS voices prove that the harness
works. Their numbers say nothing about accuracy: a generated voice in a silent file is
far easier than a person in a room, and the reports say so in a warning line.

## What runs

| File | What it does |
|---|---|
| `speech.ts` | The scorer, the manifest's rules and the runner |
| `prompts.json` | What people read aloud for scripted clips, in English, Portuguese and Spanish |
| `synthetic.mjs` | Writes synthetic clips of the prompts and their manifest (macOS only) |
| `../speech.test.mjs` | Proves the scorer and the runner in CI, against the real handler with a stand-in provider. It sends nothing |

```sh
# Synthetic clips, to prove the harness. Keep the folder outside the repository.
node packages/api/evaluation/speech/synthetic.mjs --out ~/weave-speech/synthetic
# A run: every clip once, one at a time, against a deployment with cloud speech on.
bun run --filter @weave/api eval:speech -- --manifest ~/weave-speech/synthetic/manifest.json \
  --base https://weave.regencommons.com --output ~/weave-speech/report.json
```

The runner first asks the deployment whether cloud speech is on and sends nothing if it
is not. It reads every file before sending the first, so a missing file costs no
allowance. Each clip goes as the app sends it: the recording as the body, its type
(`audio/webm`, `audio/ogg` or `audio/mp4`), `x-weave-speech-agreement: cloud`, the
clip's language in `x-weave-speech-language`, and the deployment's own origin, with a
90-second limit per clip. A lost connection fails that clip and the run goes on; after
the day's limit, or with cloud speech off, the rest are marked not sent. The report
gives each clip's WER, character error rate, edits and how long the answer took, and
totals by language, with recorded and synthetic clips always apart. It keeps no words
unless you add `--include-text`; never commit or share a report with words from a
person's recording.

## How words are scored

Both texts are compared as words: lower case, without punctuation, with apostrophes
inside a word kept ("we're") and accents kept, since "é" and "e" are different words in
Portuguese. WER is substitutions, deletions and insertions over the reference's words,
pooled over a language's transcribed clips so a long clip counts for more; the
character error rate beside it is pooled the same way. A clip that failed or was not
sent is counted, not scored. Numbers are compared as written, so "two" against "2" is
an error: keep numbers out of prompts, and in a reference write them as Whisper tends
to, small numbers as words and large ones as digits ("two or three", "3,000").

## Recording real clips

**Who.** Team members who agree to it, and nobody else. A voice can identify a person,
so before recording, each speaker reads and signs a short consent note. It says:

- what is recorded: their voice reading prompts, and two short clips in their own words;
- what it is for: measuring how well Weave's cloud speech hears people;
- where the clips go each time the evaluation runs: the private folder and archive
  below, a GitHub Actions runner that downloads them for that run, Weave's function on
  Vercel, and Cloudflare Workers AI, which turns them into text under Cloudflare's terms;
- who can open them: the named people the private folder is shared with;
- how long they are kept: until the speaker asks, or 12 months, whichever comes first;
- that saying no changes nothing for them, and that they can withdraw at any time by
  telling the person named in the note, who then deletes every copy (the folder, the
  archive and anyone's local copy, including a report made with `--include-text`) and
  leaves their clips out of every later run.

Own-words clips must not name other people or say anything private about them. Keep the
signed notes in the private folder, never in the archive the workflow downloads and
never in this repository. A speaker is a code such as `s02` from the notes; the manifest
refuses anything else.

**What.** About 30 clips of 5 to 20 seconds: about 8 each in English, Portuguese
(Brazil) and Spanish, and 6 in Swahili. Spread them over at least two speakers per
language where you can. For each language:

- Read three describe prompts, two needs prompts and one offers prompt from
  `prompts.json`, in your own natural pace. Saying it slightly differently is fine; the
  reference is then what you said.
- Record two clips in your own words: describe an initiative you know, and list two or
  three things it needs. Write down exactly what you said afterwards.
- Vary the conditions: most in a quiet room, a few with ordinary background noise (a
  street, a kitchen), and a few with the phone at arm's length.
- Swahili prompts are not in `prompts.json`: a Swahili speaker should write six in the
  same three shapes, so they sound like Swahili and not like a translation.

**How.** Record the way the app does where you can: in Chrome, which records WebM with
Opus at a low bit rate and with its own noise and echo processing (any small page that
uses `MediaRecorder`, such as an online voice recorder that saves `.webm`, does the
same). A phone's voice recorder saves MP4 with AAC (`.m4a`) at a higher bit rate, which
can make the error rate look better than in the app; note the device in `conditions`.
Keep each file as recorded; do not clean or compress it. Name each file by its clip ID:
the language, the shape (`describe`, `needs`, `offers` or `own`) and a number, such as
`pt-needs-3.m4a`.

**The reference transcript.** Exactly what was said, as a person would type it: with
the words repeated if they were said twice, without "um" and "uh", numbers as described
above, and names as they are spelled. Have a second person who speaks the language
check each one against the recording.

**The manifest.** One `manifest.json` beside the clips:

```json
{
  "version": 1,
  "set": "recorded-2026-12-02",
  "recordedOn": "2026-12-02",
  "consent": "Signed consent notes are kept in the private folder, one per speaker code.",
  "clips": [
    { "id": "pt-needs-3", "file": "pt-needs-3.m4a", "language": "pt-BR", "kind": "recorded", "speaker": "s02",
      "reference": "A gente precisa de máquinas de costura usadas.", "conditions": "phone recorder, kitchen, radio on", "seconds": 7.5 }
  ]
}
```

`language` is one of `en`, `pt-BR`, `es` and `sw`. The set's name and the clip IDs
reach a run's log and report, which anyone can read for a public repository, so they
are codes: a set is `recorded-` or `synthetic-` and a date, and a clip is
`<language>-<shape>-<number>`. A recorded clip's `speaker` is `s` and a number from the
consent notes, never a name, initials or an email; the runner refuses anything else. A
synthetic clip has `kind: "synthetic"` and a `voice`, and no speaker. `seconds` is at
most 180, the app's own limit.

## Where clips live

**Not in this repository.** It is public, and recordings of team members' voices are
personal data. Keep the clips, the manifest and the consent notes together in a private
folder the team controls, such as a private cloud drive folder shared with named people.
For the workflow, put the clips and `manifest.json` in one `.tar.gz` at a private
address. Anyone with that address can download everyone's voice, so use a link that
expires, set it as `SPEECH_CLIPS_URL` just before a run, and let it lapse after.
Synthetic clips can be made again at any time, so they are not kept either.

## The workflow

`.github/workflows/speech-eval.yml` runs only when someone starts it from the Actions
tab, and sends only to production: a preview runs unreviewed branch code, and would
receive every speaker's voice. Its secret, `SPEECH_CLIPS_URL`, belongs to the
`speech-evaluation` environment, not the repository, so a repository admin can require
a reviewer's approval for each run and limit it to `develop` and `main` (Settings,
Environments). Set those protections before the first real clips go in. The workflow
downloads the archive, runs every clip once, and keeps the report, without any words,
as a workflow artifact for 30 days. It fails at once, sending nothing, if the secret is
not set or cloud speech is off. It is not scheduled: a schedule belongs once there are
real clips and a decision about how often the allowance should be spent.

## What a run does not show

The words a page shows also depend on what Weave does with them next: the describe and
intake rules are measured by the extraction eval in
[`packages/app/evaluation`](../../../app/evaluation/README.md#extraction). Browser speech
(the Web Speech API) is not measured here: it runs inside the browser, and nothing
records it.

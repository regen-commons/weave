/**
 * What Weave says about data, in one place. Two different things read from here: "What we store",
 * a short answer to the questions people ask first, and the data policy, which is the whole of it.
 *
 * Every sentence states what the code does today and nothing it does not guarantee:
 * - Sign-in is Certified's. Weave receives an identifier, never the email address, unless the
 *   person adds one for Certified, which Weave passes on and does not keep (`@weave/api` sign-in).
 * - Saving sends the checked card, kept needs and offers and kept funding details, and nothing
 *   else (`src/account/document.ts`). Saved copies are not encrypted in the database.
 * - Team workspaces, sharing for matching and publishing are separate choices with their own
 *   readers (`src/social/LiveExposure.tsx`).
 * - The assistant sends no words to a cloud model, and the app loads no analytics (`vercel.json`,
 *   `src/describe`).
 * - Talking uses speech on the device where the browser has it; elsewhere the browser's own speech
 *   service, only after the person agrees (`src/describe/speech.ts`,
 *   `src/describe/speech-consent.ts`). That service is the browser's, and it may send the audio away.
 * - Weave receives audio in one case only: a browser with no speech recognition at all, the server
 *   has cloud speech on, and the person agreed to its notice. The page then records and sends the
 *   recording once to `/api/transcribe`, which passes it to Cloudflare Workers AI and stores and
 *   logs nothing (`src/describe/speech-cloud.ts`, `@weave/api` transcribe). The device keeps the
 *   time and length of each recording sent, and nothing of its content
 *   (`src/describe/speech-cloud-log.ts`).
 * - One saved card and one device backup can be deleted. A whole account cannot, yet.
 * Change a sentence here only with the code that makes it true.
 */
export type Term = readonly [question: string, answer: string];

export const STORAGE_SUMMARY: readonly Term[] = [
  ["On this device", "Your draft, conversations, files and backups stay in this browser until you save."],
  [
    "When you save",
    "Your checked card, the needs and offers you kept and your funding details go to the Regen Commons database, linked to your Certified sign-in. Conversations and files are not sent.",
  ],
  [
    "Who can read a saved copy",
    "In Weave, only you, and teammates you give access to a team workspace. Saved copies are not encrypted, so the people who run the Regen Commons database could read them.",
  ],
  [
    "Sharing and publishing",
    "Nothing is shared until you choose it, and you see what leaves first. Sharing for matching reaches signed-in people whose entries fit yours. Publishing on Certified is public.",
  ],
  [
    "Talking and the assistant",
    "Your browser turns your voice into text, with its own speech service only after you agree. Weave receives a recording only if you agree to cloud speech, and does not keep it. The assistant reads words on this device.",
  ],
  [
    "Leaving",
    "Signing out keeps what is on this device. You can download it and delete backups in Settings, and delete a saved card in Your Initiatives. Deleting a whole account is not available yet.",
  ],
];

export const DATA_POLICY: readonly { title: string; body: readonly string[] }[] = [
  {
    title: "What Stays On This Device",
    body: [
      "Your draft, conversations, files, unfinished edits, assistant records and backups are kept in this browser. Settings can download all of it, including files.",
      "Clearing this site's data in your browser removes them. Work you have not saved cannot be recovered after that.",
    ],
  },
  {
    title: "Signing In",
    body: [
      "You sign in with Certified, an account service separate from Weave. Certified handles your email address and the code it sends you.",
      "Weave receives an identifier for your Certified account and keeps a session cookie for up to one hour. Weave does not keep your email address. If you choose to add your email before signing in, Weave passes it to Certified, where it appears in the link and may be saved in browser history or request logs.",
    ],
  },
  {
    title: "Saving",
    body: [
      "Saving sends your checked card, the needs and offers you kept and your funding details to the Regen Commons database, linked to your Certified account. Conversations, files, unfinished edits and assistant records are not sent.",
      "In Weave, only you can open a saved copy. Saved copies are not encrypted in the database, so the people who administer it for Regen Commons could read them.",
    ],
  },
  {
    title: "Teams, Sharing And Publishing",
    body: [
      "Each of these is its own choice, and each shows what leaves before you confirm.",
      "A team workspace can be read by the teammates who are given access to it. Sharing for matching shows the needs and offers you pick, with your initiative's name, description, places and themes, to other signed-in people whose own shared entries fit. Publishing on Certified creates a public record that anyone, and other apps, can read.",
      "Opening or linking your Certified projects needs a separate permission. With it, Weave reads your Certified projects and the groups you belong to.",
    ],
  },
  {
    title: "Talking",
    body: [
      "When you talk, your browser turns your voice into text wherever it can, and gives Weave only the words.",
      "Where your browser can do that on this device, the audio stays here. Where it cannot, your browser can send your voice to its own speech service instead. Weave asks before the first time, and you can turn it off in Settings. That service belongs to your browser, so its own terms apply.",
      "Some browsers cannot turn speech into text at all. Where Weave offers cloud speech there, and only if you agree, Weave records what you say and, when you press Stop or the recording reaches its limit of three minutes at most, sends it once through its own server to Cloudflare Workers AI, which turns it into text. Discard drops it unsent. Weave does not keep the recording or the words on its server. Cloudflare says it does not keep them or use them to train models. The recording may be processed outside your country. This device notes when a recording was sent and how long it was, and Settings shows how many. Weave asks before the first time, and you can turn it off in Settings.",
      "On a phone, your keyboard's microphone key is part of the phone, not Weave.",
    ],
  },
  {
    title: "The Assistant",
    body: [
      "The assistant reads your words on this device, with keyword rules or a model already built into your browser, and only after you choose it. The assistant sends no words to a cloud model.",
      "Places are kept as you wrote them, with no map lookup.",
    ],
  },
  {
    title: "Public Initiatives",
    body: [
      "The Initiatives list shows projects that are already public on Certified. Weave reads that public list each day and keeps a copy of each project's public description.",
    ],
  },
  {
    title: "Other Services",
    body: [
      "The app loads no analytics or advertising scripts. The services that host Weave and handle sign-in keep their own request logs, which Weave does not control.",
    ],
  },
  {
    title: "Deleting And Leaving",
    body: [
      "Signing out ends your session and keeps this device's draft and backups. You can delete device backups in Settings and delete a saved card in Your Initiatives. A card that is still shared or linked to a project is not deleted, and Weave says why.",
      "Deleting a whole account and downloading the copies saved in it are not available in Weave yet.",
    ],
  },
];

/**
 * What signing in and saving do, said the same way wherever they are offered: the account dialog,
 * the example door, Your Initiatives and Settings. Signing in establishes who the person is and
 * moves nothing (`src/account/sign-in.ts`). Saving is a separate press and sends what
 * `accountDocument` holds. The session is a cookie of an hour at most (`@weave/api`).
 */
export const SIGN_IN = {
  offer: "Sign in with Certified to save your work and open it on another device. In Weave, only you can open what you save.",
  effect: "Signing in only says who you are. Nothing is saved, loaded or shared until you choose it.",
  saved:
    "Saving keeps your checked card, needs, offers and kept funding details. Conversations, files, unfinished edits and assistant records stay on this device.",
  session: "This session lasts up to one hour. Sign in again when it ends.",
} as const;

/**
 * What Certified is, in the order people ask. Each line says only what Weave does today: sign-in
 * gives Weave an identity and no email address, and reading projects takes a separate permission.
 */
export const CERTIFIED_FACTS = [
  [
    "What it is",
    "A free account for your profile and your work. It does not belong to Weave or to any one app. The Hypercerts Foundation runs it.",
  ],
  [
    "Why Weave uses it",
    "So you do not need a separate Weave account. The same sign-in works in other apps that use Certified.",
  ],
  [
    "How you sign in",
    "Certified emails you a code, so there is no password. If you are new, you can join there and come straight back.",
  ],
  [
    "What Weave learns",
    "Who you are on Certified, so your saved work is yours. Weave does not keep an email address from sign-in.",
  ],
  [
    "Your projects",
    "Weave reads your Certified projects and groups only after you give a separate permission on Certified.",
  ],
] as const;

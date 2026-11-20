import { useEffect, useState, useSyncExternalStore } from "react";
import { deviceConsent, type BrowserSpeechConsent } from "./speech-consent.ts";
import { speechSetupStore, type SpeechSetupState, type SpeechSetupStore } from "./speech-setup.ts";

let device: SpeechSetupStore | undefined;
/** This browser's speech: one store for the whole visit, so a setup under way follows the person. */
export function deviceSpeech(): SpeechSetupStore {
  return (device ??= speechSetupStore());
}

export interface SpeechSetup {
  readonly state: SpeechSetupState;
  /**
   * The browser is answering for a newly chosen language. Until it does, `state` is the last
   * answer, so Voice input keeps its place and the language choice keeps the focus; its button waits.
   */
  readonly asking: boolean;
  /** This page asked for the setup of this language, so it is the one to say when speech is ready. */
  readonly setUpHere: boolean;
  /** The person agreed, on this device, to the browser's own speech service. */
  readonly agreed: boolean;
  /** The device is used mainly by touch. */
  readonly touch: boolean;
  /** The agreement the browser's speech service needs, for `startSpeech`. */
  readonly consent: BrowserSpeechConsent;
  /** Call from the tap, which the browser requires before it downloads anything. */
  setUp(): void;
  /** Asks the browser again, as after Speak found speech not ready after all. */
  check(): void;
}

/** Whether the person agreed to the browser's speech service, kept current across tabs. */
export function useBrowserSpeechAgreement(consent: BrowserSpeechConsent = deviceConsent()): boolean {
  return useSyncExternalStore(consent.subscribe, consent.agreed);
}

/** Where speech stands for the language a page listens in, asked as the page opens and when the language changes. */
export function useSpeechSetup(
  language: string,
  store: SpeechSetupStore = deviceSpeech(),
  consent: BrowserSpeechConsent = deviceConsent(),
): SpeechSetup {
  const current = useSyncExternalStore(store.subscribe, () => store.state(language));
  const agreed = useBrowserSpeechAgreement(consent);
  const [settled, setSettled] = useState(current);
  if (current !== "checking" && current !== settled) setSettled(current);
  const asking = current === "checking" && settled !== "checking";
  const [started, setStarted] = useState<string | null>(null);
  useEffect(() => store.check(language), [store, language]);
  return {
    state: asking ? settled : current,
    asking,
    setUpHere: started === language,
    agreed,
    touch: store.touch,
    consent,
    setUp() {
      store.setUp(language);
      setStarted(language);
    },
    check: () => store.check(language),
  };
}

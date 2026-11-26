import { useEffect, useState, useSyncExternalStore } from "react";
import { deviceCloudSpeechLog, type CloudSpeechLog, type CloudSpeechUse } from "./speech-cloud-log.ts";
import { deviceCloudConsent, deviceConsent, type SpeechConsent } from "./speech-consent.ts";
import { deviceSpeechRecord, type BrowserSpeechRecord, type BrowserSpeechRecordState } from "./speech-fallback.ts";
import { speechSetupStore, type SpeechAvailability, type SpeechSetupState, type SpeechSetupStore } from "./speech-setup.ts";
import { deviceSpeechChoice, type SpeechChoice, type SpeechChoiceStore } from "./speech-choice.ts";

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
  /**
   * The person agreed, on this device, to the way of talking this state offers: the browser's own
   * speech service, or cloud speech where the state is `cloud`. The two are separate agreements.
   */
  readonly agreed: boolean;
  /** The device is used mainly by touch. */
  readonly touch: boolean;
  /** The agreement that way of talking needs, for `startSpeech`. */
  readonly consent: SpeechConsent;
  /** Call from the tap, which the browser requires before it downloads anything. */
  setUp(): void;
  /** Asks the browser again, as after Speak found speech not ready after all. */
  check(): void;
}

/** Whether the person agreed to the browser's speech service, kept current across tabs. */
export function useBrowserSpeechAgreement(consent: SpeechConsent = deviceConsent()): boolean {
  return useSyncExternalStore(consent.subscribe, consent.agreed);
}

/** Whether the person agreed to cloud speech, kept current across tabs. */
export function useCloudSpeechAgreement(consent: SpeechConsent = deviceCloudConsent()): boolean {
  return useSyncExternalStore(consent.subscribe, consent.agreed);
}

/** The device's record of whether the browser's own speech service works here, kept current across tabs. */
export function useBrowserSpeechRecord(record: BrowserSpeechRecord = deviceSpeechRecord()): BrowserSpeechRecordState {
  return useSyncExternalStore(record.subscribe, record.state);
}

/** The way of talking chosen in Settings, kept current across tabs. */
export function useSpeechChoice(choice: SpeechChoiceStore = deviceSpeechChoice()): SpeechChoice | null {
  return useSyncExternalStore(choice.subscribe, choice.chosen);
}

/** What each way of talking can do here for one language, as the intake found it. */
export function useSpeechAvailability(language: string, store: SpeechSetupStore = deviceSpeech()): SpeechAvailability | null {
  return useSyncExternalStore(store.subscribe, () => store.availability(language));
}

/** The device's record of the recordings it has sent for cloud speech, kept current across tabs. */
export function useCloudSpeechUses(log: CloudSpeechLog = deviceCloudSpeechLog()): readonly CloudSpeechUse[] {
  return useSyncExternalStore(log.subscribe, log.list);
}

/** Where speech stands for the language a page listens in, asked as the page opens and when the language changes. */
export function useSpeechSetup(
  language: string,
  store: SpeechSetupStore = deviceSpeech(),
  /** An example world's one agreement, which stands for whichever way of talking its browser has. */
  example?: SpeechConsent,
): SpeechSetup {
  const current = useSyncExternalStore(store.subscribe, () => store.state(language));
  const browserConsent = example ?? deviceConsent();
  const cloudConsent = example ?? deviceCloudConsent();
  const browserAgreed = useBrowserSpeechAgreement(browserConsent);
  const cloudAgreed = useCloudSpeechAgreement(cloudConsent);
  const [settled, setSettled] = useState(current);
  if (current !== "checking" && current !== settled) setSettled(current);
  const asking = current === "checking" && settled !== "checking";
  const [started, setStarted] = useState<string | null>(null);
  useEffect(() => store.check(language), [store, language]);
  const state = asking ? settled : current;
  // Each way of talking has its own agreement: agreeing to one never agrees to the other.
  const cloud = state === "cloud";
  return {
    state,
    asking,
    setUpHere: started === language,
    agreed: cloud ? cloudAgreed : browserAgreed,
    touch: store.touch,
    consent: cloud ? cloudConsent : browserConsent,
    setUp() {
      store.setUp(language);
      setStarted(language);
    },
    check: () => store.check(language),
  };
}

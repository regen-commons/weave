import type { Page } from "@playwright/test";

/**
 * A stand-in for the browser's on-device speech recognizer, put in the page before the app loads. It
 * answers the app's question about the device as "available" and, once started, says `phrases` one at a
 * time, first as interim words and then as final ones, the way Chrome's recognizer writes without
 * punctuation. Stop ends the session as a real one does. No microphone is used and nothing is sent.
 */
export async function fakeSpeech(page: Page, phrases: string[]): Promise<void> {
  await page.addInitScript((said: string[]) => {
    type Result = { isFinal: boolean; 0: { transcript: string }; length: 1 };
    class FakeRecognition {
      lang = "en-US";
      continuous = false;
      interimResults = false;
      onresult: ((event: { results: Result[] }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      #timers: number[] = [];
      #ended = false;
      static available() {
        return Promise.resolve("available");
      }
      static install() {
        return Promise.resolve(true);
      }
      start() {
        const results: Result[] = [];
        said.forEach((phrase, index) => {
          this.#timers.push(window.setTimeout(() => {
            this.onresult?.({ results: [...results, { isFinal: false, 0: { transcript: phrase }, length: 1 }] });
          }, 120 + index * 240));
          this.#timers.push(window.setTimeout(() => {
            results.push({ isFinal: true, 0: { transcript: phrase }, length: 1 });
            this.onresult?.({ results: [...results] });
          }, 240 + index * 240));
        });
      }
      stop() {
        window.setTimeout(() => this.#end(), 80);
      }
      abort() {
        this.#timers.forEach((timer) => window.clearTimeout(timer));
        this.#end();
      }
      #end() {
        if (this.#ended) return;
        this.#ended = true;
        this.onend?.();
      }
    }
    // The app asks the prototype for processLocally to know the browser can keep audio on the device.
    Object.defineProperty(FakeRecognition.prototype, "processLocally", { value: false, writable: true });
    Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true });
  }, phrases);
}

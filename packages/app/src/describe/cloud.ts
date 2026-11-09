/** No transport can be connected until D35 supplies the provider, scope and ledger contract. */
export const cloudAssistant = Object.freeze({
  available: false as const,
  async extract(_input: unknown): Promise<never> {
    throw new Error(
      "Cloud assistance is unavailable until the D35 consent and server contracts are approved.",
    );
  },
});

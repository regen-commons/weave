/**
 * The addresses the app sends people to outside Weave. Each one was opened and read, and a line
 * says so where who owns the page is still to be confirmed. Change an address here and every
 * link follows.
 */
export const COMMONS = {
  website: "https://regencommons.com",
  learn: "https://regencommons.com/learn",
  membership: "https://regencommons.com/join",
  // Opens with the title "Regen Commons". The website does not link to this channel yet, so
  // who runs it is still to be confirmed.
  youtube: "https://www.youtube.com/@regencommons",
  forum: "https://hub.regencoordination.xyz/c/regen-commons/33",
} as const;
/** Ethan Roland and Gregory Landua's 2011 essay, the source of the eight kinds of support. */
export const EIGHT_FORMS_OF_CAPITAL = "https://ethansoloviev.com/8-forms-of-capital/";
/** Certified's own page about what the account is, who runs it and what it costs. */
export const CERTIFIED = "https://certified.app/welcome";
/** The person who builds Weave for Regen Commons. */
export const BUILDER = { name: "Afolabi Aiyeloja", href: "https://afolabi.info" } as const;

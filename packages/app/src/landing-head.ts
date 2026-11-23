/**
 * The canonical link and JSON-LD the server writes name the page a person landed on, and only that page
 * (DL-136). Once the person moves inside the app they would name the wrong page, to a browser's own Share
 * among others, so they are taken out. They are for crawlers, which do not move.
 */
export const LANDING_HEAD = 'link[rel="canonical"], script[type="application/ld+json"]';

export function forgetLandingHead(head: Pick<ParentNode, "querySelectorAll">): void {
  for (const element of head.querySelectorAll(LANDING_HEAD)) element.remove();
}

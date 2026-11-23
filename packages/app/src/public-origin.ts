/**
 * Weave's public address. A link preview has to give its page and image as full addresses, the install
 * guide's QR code is drawn for this one, and a shared record links to it, so all of them read it here.
 * It is defined beside the link preview tags in `@weave/api/page-preview`, which the record pages'
 * server function reads too.
 */
export { PUBLIC_ORIGIN } from "@weave/api/page-preview";

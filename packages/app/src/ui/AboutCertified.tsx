import { useState } from "react";
import { CERTIFIED_FACTS } from "../data/privacy.ts";
import { CERTIFIED } from "../links.ts";
import { Link } from "../router.tsx";
import { Dialog } from "./Dialog.tsx";

/**
 * What Certified is, wherever sign-in names it: a quiet button that opens the explanation in its
 * own dialog, so the page it is on keeps its shape (DL-083). It also opens over the account door.
 */
export function AboutCertified() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="rc-button" data-variant="quiet" type="button" onClick={() => setOpen(true)}>
        What is Certified?
      </button>
      <Dialog presentation="information" title="What is Certified?" open={open} leaves onClose={() => setOpen(false)}>
        <p>Certified is the account you sign in to Weave with.</p>
        <dl className="rc-facts" data-kind="terms">
          {CERTIFIED_FACTS.map(([title, body]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{body}</dd>
            </div>
          ))}
        </dl>
        <p>
          <Link href={CERTIFIED}>Read more on Certified</Link>
        </p>
      </Dialog>
    </>
  );
}

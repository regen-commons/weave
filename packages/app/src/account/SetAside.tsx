import { useState, type ReactNode } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { navigate } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Heading } from "../ui/Heading.tsx";
import { Doorway } from "../ui/layouts.tsx";
import { useSetAside } from "./set-aside.ts";

/** The card's own pages, only for the account it belongs to; anyone else meets the set-aside doorway. */
export function ForThisAccount({ children }: { children: ReactNode }) {
  return useSetAside() ? <SetAsideCard /> : <>{children}</>;
}

/**
 * Another account's card on this device (DL-055): it stays here and opens again when that account
 * signs in. This account can start its own, which is a draft of its own beside it (DL-112).
 */
export function SetAsideCard() {
  const { controller } = useDraft();
  const [problem, setProblem] = useState("");
  async function startNew() {
    try {
      await controller.startNew();
      navigate(pathTo("initiative"));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "A new initiative could not be started. Try again.");
    }
  }
  return (
    <Doorway>
      <Heading level={1} size="page">
        This card belongs to another account
      </Heading>
      <p className="rc-prose">It stays on this device and opens again when that account signs in.</p>
      <div className="rc-action-bar">
        <button className="rc-button" data-variant="primary" type="button" onClick={() => void startNew()}>
          Start a new initiative
        </button>
        <ButtonLink href={pathTo("your-initiatives")} variant="secondary">
          Go to Your Initiatives
        </ButtonLink>
      </div>
      <p className="rc-meta">The other card stays on this device.</p>
      {problem && <p role="alert">{problem}</p>}
    </Doorway>
  );
}

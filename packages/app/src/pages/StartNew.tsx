import { useEffect, useState } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { beginNewInitiative } from "../describe/start-new.ts";
import { cardRoute } from "../initiative/status.ts";
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Heading } from "../ui/Heading.tsx";
import { Stack } from "../ui/layouts.tsx";
import { IntakeStepper } from "../ui/Stepper.tsx";
import { Describe } from "./Describe.tsx";

/**
 * The address every "Start An Initiative" leads to. It starts a new card once, and then shows
 * step 1 in its place, so Back, a reload and a new tab all land on the new card's step 1. Until
 * then it draws step 1 itself, blank and not yet taking input, so the step is on screen at once
 * and nothing moves when the new card opens.
 */
export function StartNew() {
  const { controller, draft } = useDraft();
  const [problem, setProblem] = useState("");
  useEffect(() => {
    // Called off when the page goes: Back or a link pressed while storage is still being read
    // starts nothing and never replaces the page the person moved to.
    const leave = new AbortController();
    void (async () => {
      try {
        await beginNewInitiative(controller, leave.signal);
        if (leave.signal.aborted) return;
        navigate(fixtureHref(pathTo("initiative"), routeSearch(), true), true, true);
      } catch (error) {
        if (leave.signal.aborted) return;
        // Words not stored yet stay on the card they belong to. Nothing is started over them.
        setProblem(error instanceof Error ? error.message : "A new initiative could not be started. Try again.");
      }
    })();
    return () => leave.abort();
  }, [controller]);
  if (!problem) return <Describe starting />;
  return (
    <Stack>
      <IntakeStepper current={0} />
      <Heading level={1} size="page">
        Tell Us About Your Initiative
      </Heading>
      <p role="alert">{problem}</p>
      <div className="rc-action-bar">
        <ButtonLink href={pathTo(cardRoute(draft))} variant="primary">
          Continue Your Initiative
        </ButtonLink>
      </div>
    </Stack>
  );
}

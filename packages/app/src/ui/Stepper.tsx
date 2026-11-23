import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { currentVisit, Link, routePath } from "../router.tsx";
import { backTarget, INTAKE_STEPS, matchRoute, pathTo, splitRoute } from "../routes.ts";
import { followBack } from "./BackLink.tsx";
import { StepBarContext } from "./dock.ts";

/**
 * Stepper molecule (`rc-stepper`): where the person is in a short sequence. A step already done
 * is a link back to it (DL-113); the current step and the ones ahead are plain words.
 */
export function Stepper({
  steps,
  current,
  until,
}: {
  steps: readonly { readonly label: string; readonly href?: string }[];
  current: number;
  /** The copy at the top of a page is a phone's where a wide screen shows the steps in the Step bar. */
  until?: "wide";
}) {
  // The step a page's way back goes to is reached the same way from here, so its link, the Back
  // button and the back gesture agree (DL-113).
  const back = backTarget(matchRoute(routePath()), currentVisit());
  return (
    <ol className="rc-stepper" aria-label="Steps" data-until={until}>
      {steps.map(({ label, href }, index) => {
        const done = index < current;
        const body = (
          <>
            <span className="rc-stepper-mark" aria-hidden="true">
              {index + 1}
            </span>
            {label}
          </>
        );
        return (
          <li key={label} aria-current={index === current ? "step" : undefined} data-state={done ? "done" : undefined}>
            {done && href ? (
              <Link
                href={href}
                aria-label={`Back to step ${index + 1}, ${label}`}
                onClick={(event) => {
                  if (back && splitRoute(back.href).pathname === href) followBack(event, back);
                }}
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The three steps of starting an initiative, on each of their pages, with the ones done as links
 * back. A phone shows them at the top of the page and docks the way forward (DL-089). A wide
 * screen shows them in the Step bar under the app bar, with the step's way forward (`children`)
 * at the bar's far end, so both stay in view while the page scrolls (DL-127). The steps are in
 * the markup twice and on screen once.
 */
export function IntakeStepper({ current, children }: { current: number; children?: ReactNode }) {
  const bar = useContext(StepBarContext);
  const steps = INTAKE_STEPS.map((step) => ({ label: step.label, href: pathTo(step.route) }));
  return (
    <>
      <Stepper current={current} steps={steps} until="wide" />
      {bar &&
        createPortal(
          <>
            <Stepper current={current} steps={steps} />
            {children && <div className="rc-action-bar">{children}</div>}
          </>,
          bar,
        )}
    </>
  );
}

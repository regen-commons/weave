import { Link } from "../router.tsx";
import { INTAKE_STEPS, pathTo } from "../routes.ts";

/**
 * Stepper molecule (`rc-stepper`): where the person is in a short sequence. A step already done
 * is a link back to it (DL-113); the current step and the ones ahead are plain words.
 */
export function Stepper({
  steps,
  current,
}: {
  steps: readonly { readonly label: string; readonly href?: string }[];
  current: number;
}) {
  return (
    <ol className="rc-stepper" aria-label="Steps">
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
              <Link href={href} aria-label={`Back to step ${index + 1}, ${label}`}>
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

/** The three steps of starting an initiative, on each of their pages, with the ones done as links back. */
export function IntakeStepper({ current }: { current: number }) {
  return (
    <Stepper
      current={current}
      steps={INTAKE_STEPS.map((step) => ({ label: step.label, href: pathTo(step.route) }))}
    />
  );
}

/** Stepper molecule (`rc-stepper`): where the person is in a short sequence. */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="rc-stepper" aria-label="Steps">
      {steps.map((label, index) => (
        <li key={label} aria-current={index === current ? "step" : undefined}>
          <span className="rc-stepper-mark" aria-hidden="true">
            {index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

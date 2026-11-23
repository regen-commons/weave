import type { Evaluation } from "../funding/contracts.ts";
import { fitExplanation, fundingFit, type FundingFit } from "../funding/fit.ts";
import { Tooltip } from "./Tooltip.tsx";
/** Every fit the app shows. Partner cards use the first three; funding uses all four (DL-129). */
export type FitLevel = FundingFit;
const LABELS: Record<FitLevel, string> = {
  strong: "Strong fit",
  good: "Good fit",
  possible: "Possible fit",
  low: "Low fit",
};
/** A fit as a word and a bar of four steps. The same word always fills the same steps. */
export function Fit({ level, explanation, label }: { level: FitLevel; explanation: string; label?: string }) {
  return (
    <Tooltip text={explanation}>
      <span className="rc-fit" data-level={level}>
        <span className="rc-fit-bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        {label ?? LABELS[level]}
      </span>
    </Tooltip>
  );
}

/** A funding program's fit for the initiative compared, or a plain word where its topics could not be assessed. */
export function FitLine({ result }: { result: Evaluation }) {
  const level = fundingFit(result.thematicFit.score);
  return level ? <Fit level={level} explanation={fitExplanation(result)} /> : <p className="rc-meta">Fit not assessed</p>;
}

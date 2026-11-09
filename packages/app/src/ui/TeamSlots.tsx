import { SocialAction } from "../social/Action.tsx";
import { useEffect, useId, useState } from "react";
import type { TeamAsk } from "../funding/team.ts";
import { teamCoverage } from "../funding/team.ts";
import { Fit } from "./Fit.tsx";
export function TeamSlots({ asks, shared }: { asks: TeamAsk[] | null; shared: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const id = useId();
  useEffect(() => {
    if (!shared) setSelected([]);
  }, [shared]);
  if (!import.meta.env.DEV || asks === null)
    return (
      <section className="rc-stack">
        <h2 className="rc-heading" data-size="section">
          Stronger with a team
        </h2>
        <p>
          Partner requirements have not been structured or checked for this call. Check the funder's published
          terms.
        </p>
        <p className="rc-meta">No verified partner count is available for this call.</p>
      </section>
    );
  const coverage = teamCoverage(asks, shared ? selected : []);
  const candidates = [
    ...new Map(asks.flatMap((ask) => ask.candidates).map((candidate) => [candidate.id, candidate])).values(),
  ].filter((candidate) => coverage.chosen.includes(candidate.id));
  return (
    <section className="rc-stack" aria-labelledby={`${id}-heading`}>
      <h2 className="rc-heading" data-size="section" id={`${id}-heading`}>
        Stronger with a team
      </h2>
      <p className="rc-meta">
        Fictional team requirements and coverage. These are not this funder's verified terms. Nothing is sent.
      </p>
      {!asks.length ? (
        <p>This example asks for no partner. It does not establish eligibility.</p>
      ) : (
        <>
          <ol className="rc-team-slots">
            {asks.map((ask, index) => (
              <li className="rc-team-slot" key={ask.id}>
                <h3 className="rc-card-title">
                  {index + 1}. {ask.label}
                </h3>
                {!ask.candidates.length ? (
                  <p className="rc-meta">Nobody in the example list yet.</p>
                ) : !shared ? (
                  <p className="rc-meta">
                    {new Set(ask.candidates.map((candidate) => candidate.id)).size} on the example list could
                    do this. Names stay private.
                  </p>
                ) : (
                  <ul className="rc-team-candidates">
                    {ask.candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <label className="rc-team-candidate">
                          <input
                            className="rc-check"
                            type="checkbox"
                            checked={selected.includes(candidate.id)}
                            onChange={() => {
                              setSelected((current) =>
                                current.includes(candidate.id)
                                  ? current.filter((value) => value !== candidate.id)
                                  : [...current, candidate.id],
                              );
                            }}
                          />
                          <span>
                            <strong>{candidate.name}</strong>
                            <span className="rc-meta">{candidate.reason}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {shared ? (
            <div className="rc-team-coverage">
              <Fit
                level={
                  coverage.covered === coverage.total ? "strong" : coverage.covered ? "good" : "possible"
                }
                label={`Example team: ${coverage.covered === coverage.total ? "Strong fit" : coverage.covered ? "Good fit" : "Possible fit"}`}
                explanation="Example coverage only. Team scoring is still being agreed. This never changes the solo fit or establishes eligibility."
              />
              <p role="status">
                {coverage.covered} of {coverage.total} example asks covered by {coverage.chosen.length}{" "}
                {coverage.chosen.length === 1 ? "initiative" : "initiatives"}.
              </p>
              <p className="rc-meta">
                One initiative can cover several asks and is requested once. This does not establish
                eligibility.
              </p>
              {coverage.chosen.length > 0 && (
                <SocialAction
                  intent={{
                    kind: "intro",
                    ids: coverage.chosen,
                    names: candidates.map((candidate) => candidate.name),
                  }}
                />
              )}
            </div>
          ) : (
            <div className="rc-stack">
              <SocialAction intent={{ kind: "share" }} />
              <p className="rc-meta">
                Partners are for shared initiatives. This example keeps names hidden until you share.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

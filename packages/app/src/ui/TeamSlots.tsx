import { ShareAction } from "../social/Share.tsx";
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
        <h3 className="rc-heading" data-size="section">
          Stronger with a team
        </h3>
        <p>
          Partner requirements have not been structured or checked for this call. Check the funder's published
          terms.
        </p>
        <p className="rc-meta">No verified partner count is available for this call.</p>
      </section>
    );
  const coverage = teamCoverage(asks, shared ? selected : []);
  return (
    <section className="rc-stack" aria-labelledby={`${id}-heading`}>
      <h3 className="rc-heading" data-size="section" id={`${id}-heading`}>
        Stronger with a team
      </h3>
      {!asks.length ? (
        <p>This call asks for no partner. That does not establish eligibility.</p>
      ) : (
        <>
          <ol className="rc-team-slots">
            {asks.map((ask, index) => (
              <li className="rc-team-slot" key={ask.id}>
                <h4 className="rc-card-title">
                  {index + 1}. {ask.label}
                </h4>
                {!ask.candidates.length ? (
                  <p className="rc-meta">Nobody on the list yet.</p>
                ) : !shared ? (
                  <p className="rc-meta">
                    {new Set(ask.candidates.map((candidate) => candidate.id)).size} on the list could
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
                label={`Team: ${coverage.covered === coverage.total ? "Strong fit" : coverage.covered ? "Good fit" : "Possible fit"}`}
                explanation="Team scoring is still being agreed. This never changes your own fit or establishes eligibility."
              />
              <p role="status">
                {coverage.covered} of {coverage.total} asks covered by {coverage.chosen.length}{" "}
                {coverage.chosen.length === 1 ? "initiative" : "initiatives"}.
              </p>
              <p className="rc-meta">
                One initiative can cover several asks. This does not establish eligibility, and Weave makes no
                introductions yet.
              </p>
            </div>
          ) : (
            <div className="rc-stack">
              <ShareAction />
              <p className="rc-meta">
                Other teams' names stay hidden until you share a need or an offer for matching.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

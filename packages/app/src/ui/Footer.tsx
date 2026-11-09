import { pathTo } from "../routes.ts";
import { Link } from "../router.tsx";
import type { Information } from "./InformationDialog.tsx";
export function Footer({
  slim,
  onInformation,
}: {
  slim: boolean;
  onInformation: (value: Information) => void;
}) {
  const data = (
    <>
      <li>
        <button className="rc-footer-link" type="button" onClick={() => onInformation("storage")}>
          What we store
        </button>
      </li>
      <li>
        <button className="rc-footer-link" type="button" onClick={() => onInformation("assistant")}>
          What the assistant did
        </button>
      </li>
      <li>
        <Link className="rc-footer-link" href={pathTo("settings")}>
          Settings
        </Link>
      </li>
    </>
  );
  const commons = (
    <>
      <li>
        <a className="rc-footer-link" href="https://regencommons.com">
          Website
        </a>
      </li>
      <li>
        <a className="rc-footer-link" href="https://regencommons.com/join">
          Membership
        </a>
      </li>
      <li>
        <button className="rc-footer-link" type="button" onClick={() => onInformation("policy")}>
          Data policy
        </button>
      </li>
    </>
  );
  return (
    <footer className="rc-footer" data-slim={slim}>
      {slim ? (
        <ul className="rc-footer-row">
          {data}
          {commons}
        </ul>
      ) : (
        <div className="rc-footer-grid">
          <section>
            <h2 className="rc-footer-title">Weave</h2>
            <ul>
              <li>
                <Link className="rc-footer-link" href={pathTo("initiative")}>
                  Describe your initiative
                </Link>
              </li>
              {(["partners", "funding", "initiatives"] as const).map((name) => (
                <li key={name}>
                  <Link className="rc-footer-link" href={pathTo(name)}>
                    {name[0]!.toUpperCase() + name.slice(1)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="rc-footer-title">Your data</h2>
            <ul>{data}</ul>
          </section>
          <section>
            <h2 className="rc-footer-title">Regen Commons</h2>
            <ul>{commons}</ul>
          </section>
        </div>
      )}
    </footer>
  );
}

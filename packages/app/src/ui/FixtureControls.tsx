import { DESCRIBE_VIEWS, INTAKE_VIEWS, type FixtureContext } from "../fixtures.ts";
import { navigate } from "../router.tsx";
export function FixtureControls({ fixture }: { fixture: FixtureContext }) {
  function set(key: string, value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    if (key === "view")
      url.pathname = ["review", "correcting", "kept"].includes(value)
        ? "/start/initiative/check"
        : "/start/initiative";
    navigate(`${url.pathname}${url.search}`);
  }
  return (
    <aside className="rc-notice" data-tone="info" aria-label="Example controls">
      <details className="rc-notice-body">
        <summary className="rc-footer-link">
          Fictional examples. Changes are temporary; nothing is sent.
        </summary>
        <div className="rc-action-bar">
          <div className="rc-field">
            <label htmlFor="example-scenario">Example initiative</label>
            <select
              className="rc-input"
              id="example-scenario"
              value={fixture.scenario}
              onChange={(event) => set("fixture", event.target.value)}
            >
              <option value="visitor">Not started</option>
              <option value="draft">Draft on this device</option>
              <option value="private">Saved privately</option>
              <option value="shared">Shared with the community</option>
            </select>
          </div>
          <div className="rc-field">
            <label htmlFor="example-state">Example state</label>
            <select
              className="rc-input"
              id="example-state"
              value={fixture.state}
              onChange={(event) => set("state", event.target.value)}
            >
              <option value="ready">Ready</option>
              <option value="empty">Empty</option>
              <option value="partial">Partial</option>
              <option value="loading">Loading</option>
              <option value="offline">Offline</option>
              <option value="error">Error</option>
              <option value="long">Long content</option>
            </select>
          </div>
          {["/start/needs", "/start/offers", "/start/finish"].includes(window.location.pathname) && (
            <div className="rc-field">
              <label htmlFor="intake-example">Intake example</label>
              <select
                className="rc-input"
                id="intake-example"
                value={fixture.intake}
                onChange={(event) => set("intake", event.target.value)}
              >
                {INTAKE_VIEWS.map((view) => (
                  <option key={view} value={view}>
                    {view.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </div>
          )}
          {window.location.pathname.startsWith("/start/initiative") && (
            <div className="rc-field">
              <label htmlFor="describe-example">Describe example</label>
              <select
                className="rc-input"
                id="describe-example"
                value={fixture.describe}
                onChange={(event) => set("view", event.target.value)}
              >
                {DESCRIBE_VIEWS.map((view) => (
                  <option key={view} value={view}>
                    {view.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </details>
    </aside>
  );
}

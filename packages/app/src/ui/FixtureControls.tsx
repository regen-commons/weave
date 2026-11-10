import { DESCRIBE_VIEWS, INTAKE_VIEWS, type FixtureContext } from "../fixtures.ts";
import { currentRoute, navigate, routePath } from "../router.tsx";
import { routeWith } from "../routes.ts";
export function FixtureControls({ fixture }: { fixture: FixtureContext }) {
  const path = routePath();
  function set(key: string, value: string) {
    navigate(
      routeWith(
        currentRoute(),
        key,
        value,
        key !== "view"
          ? undefined
          : ["review", "correcting", "kept"].includes(value)
            ? "/start/initiative/check"
            : "/start/initiative",
      ),
    );
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
              <option value="workspace">Saved in a team workspace</option>
              <option value="shared">Shared for matching</option>
              <option value="published">Published</option>
              <option value="returning">Signed in, nothing on this device</option>
            </select>
          </div>
          <div className="rc-field">
            <label htmlFor="example-projects">Certified projects</label>
            <select
              className="rc-input"
              id="example-projects"
              value={fixture.projects}
              onChange={(event) => set("projects", event.target.value)}
            >
              <option value="some">Has projects</option>
              <option value="none">Has none</option>
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
          {["/your-initiative", "/your-initiatives", "/partners", "/settings"].includes(path) && (
            <div className="rc-field">
              <label htmlFor="certified-example">Certified example</label>
              <select
                className="rc-input"
                id="certified-example"
                value={fixture.certified}
                onChange={(event) => set("certified", event.target.value)}
              >
                <option value="ok">Confirms</option>
                <option value="fail">Does not confirm</option>
              </select>
            </div>
          )}
          {["/start/needs", "/start/offers", "/your-initiative"].includes(path) && (
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
          {path.startsWith("/start/initiative") && (
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

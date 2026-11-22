import { InformationContext } from "./information-context.ts";
import { useState, type ReactNode } from "react";
import { breadcrumbTrail, matchRoute, navLabel, type BackTarget, type RouteName } from "../routes.ts";
import type { SaveStatus } from "../initiative/header-status.ts";
import { AppHeader } from "./AppHeader.tsx";
import { wasReturn } from "../router.tsx";
import { BottomNav } from "./BottomNav.tsx";
import { DockContext } from "./dock.ts";
import { Breadcrumbs } from "./Breadcrumbs.tsx";
import { Footer } from "./Footer.tsx";
import { InformationDialog, type Information } from "./InformationDialog.tsx";
import { Mycelium } from "./Mycelium.tsx";
import { SessionEndedNotice, useSessionEndedNotice } from "../account/SessionEndedNotice.tsx";
export function Page({
  pathname,
  form,
  status,
  back,
  current,
  sheet,
  after,
  children,
  runs,
}: {
  pathname: string;
  /** A focused step: the tabs step aside until it is done. */
  form: boolean;
  status: SaveStatus;
  /** Where the app bar's back link goes. Tabs have none. */
  back: BackTarget | null;
  /** The page on screen, so the footer leaves out its own link. */
  current?: RouteName;
  /** A record opened over this page. */
  sheet?: ReactNode;
  /** Shown under the footer's links. */
  after?: ReactNode;
  runs: readonly import("../describe/contracts.ts").AiRun[];
  children: ReactNode;
}) {
  const [information, setInformation] = useState<Information | null>(null);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const ended = useSessionEndedNotice(pathname);
  return (
    <InformationContext.Provider value={setInformation}>
      <DockContext.Provider value={dock}>
      {/* The section sets its accent: the current tab's bar, the page's eyebrow and step numbers (DL-050). */}
      <div className="rc-page" data-section={matchRoute(pathname)?.section}>
        <a className="rc-skip-link" href="#main">
          Skip to content
        </a>
        <p className="rc-site-banner">Still in development will be live soon</p>
        <AppHeader pathname={pathname} sections={!form} status={status} back={back} ended={ended} />
        {/* One canvas under every page, fixed to the window. It outlives the page, so its resting
            network grows once. */}
        <div className="rc-page-body">
          <Mycelium extent="page" home={matchRoute(pathname)?.name === "home"} />
          <Main key={pathname} pathname={pathname} notice={<SessionEndedNotice text={ended} />}>
            {children}
          </Main>
        </div>
        {/* A focused step has no tabs. On a phone its way forward docks where they would be, and
            reads after the step and before the footer (DL-089). */}
        {form && <div className="rc-dock" ref={setDock} />}
        <Footer current={current} onInformation={setInformation}>
          {after}
        </Footer>
        {!form && <BottomNav pathname={pathname} />}
        <InformationDialog
          runs={runs}
          information={information}
          onClose={() => setInformation(null)}
          onPolicy={() => setInformation("policy")}
        />
        {sheet}
      </div>
      </DockContext.Provider>
    </InformationContext.Provider>
  );
}

/** The page's content. A page reached with Back or Forward shows as the person left it, without arriving again. */
function Main({ pathname, notice, children }: { pathname: string; notice: ReactNode; children: ReactNode }) {
  const [returned] = useState(wasReturn);
  const route = matchRoute(pathname);
  const trail = breadcrumbTrail(route);
  return (
    <main className="rc-main" id="main" tabIndex={-1} data-move={returned ? "return" : undefined}>
      {route && trail.length > 0 && <Breadcrumbs trail={trail} current={navLabel(route.name)} />}
      {notice}
      {children}
    </main>
  );
}

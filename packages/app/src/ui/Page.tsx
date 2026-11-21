import { InformationContext } from "./information-context.ts";
import { useState, type ReactNode } from "react";
import { breadcrumbTrail, matchRoute, navLabel, type BackTarget, type RouteName } from "../routes.ts";
import type { SaveStatus } from "../initiative/header-status.ts";
import { AppHeader } from "./AppHeader.tsx";
import { wasReturn } from "../router.tsx";
import { BottomNav } from "./BottomNav.tsx";
import { DockContext, StepBarContext } from "./dock.ts";
import { Breadcrumbs } from "./Breadcrumbs.tsx";
import { Footer } from "./Footer.tsx";
import { InformationDialog, type Information } from "./InformationDialog.tsx";
import { Mycelium } from "./Mycelium.tsx";
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
  const [stepBar, setStepBar] = useState<HTMLElement | null>(null);
  return (
    <InformationContext.Provider value={setInformation}>
      <DockContext.Provider value={dock}>
      <StepBarContext.Provider value={stepBar}>
      {/* The section sets its accent: the current tab's bar, the page's eyebrow and step numbers (DL-050). */}
      <div className="rc-page" data-section={matchRoute(pathname)?.section}>
        <a className="rc-skip-link" href="#main">
          Skip to content
        </a>
        <p className="rc-site-banner">Still in development will be live soon</p>
        <AppHeader pathname={pathname} sections={!form} status={status} back={back} />
        {/* One canvas under every page, fixed to the window. It outlives the page, so its resting
            network grows once. */}
        <div className="rc-page-body">
          <Mycelium extent="page" home={matchRoute(pathname)?.name === "home"} />
          <Main key={pathname} pathname={pathname}>
            {children}
          </Main>
        </div>
        {/* A focused step has no tabs. On a phone its way forward docks where they would be, and
            reads after the step and before the footer (DL-089). */}
        {form && <div className="rc-dock" ref={setDock} />}
        {/* On a wide screen a step's map and its way forward share one bar under the app bar. It
            comes after the page body, so the keyboard reaches the way forward after the step's
            fields, and the page's grid draws it above them (DL-124). */}
        <div className="rc-step-bar" ref={setStepBar} />
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
      </StepBarContext.Provider>
      </DockContext.Provider>
    </InformationContext.Provider>
  );
}

/** The page's content. A page reached with Back or Forward shows as the person left it, without arriving again. */
function Main({ pathname, children }: { pathname: string; children: ReactNode }) {
  const [returned] = useState(wasReturn);
  const route = matchRoute(pathname);
  const trail = breadcrumbTrail(route);
  return (
    <main className="rc-main" id="main" tabIndex={-1} data-move={returned ? "return" : undefined}>
      {route && trail.length > 0 && <Breadcrumbs trail={trail} current={navLabel(route.name)} />}
      {children}
    </main>
  );
}

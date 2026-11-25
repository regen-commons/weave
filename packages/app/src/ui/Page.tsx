import { InformationContext } from "./information-context.ts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { breadcrumbTrail, matchRoute, navLabel, type BackTarget, type RouteName } from "../routes.ts";
import type { SaveStatus } from "../initiative/header-status.ts";
import { AppHeader } from "./AppHeader.tsx";
import { wasReturn } from "../router.tsx";
import { replacesFirstView } from "../first-view.ts";
import { followAppHeader } from "./header-height.ts";
import { BottomNav } from "./BottomNav.tsx";
import { DockContext, StepBarContext } from "./dock.ts";
import { Breadcrumbs } from "./Breadcrumbs.tsx";
import { Footer } from "./Footer.tsx";
import { Feedback } from "../feedback/Feedback.tsx";
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
  const [stepBar, setStepBar] = useState<HTMLElement | null>(null);
  const ended = useSessionEndedNotice(pathname);
  const route = matchRoute(pathname);
  // A step's map and its way forward, drawn into the bar at the window's foot on a wide screen, are
  // a named region of their own. An empty bar, on every other page, is not one.
  const [stepsShown, setStepsShown] = useState(false);
  useEffect(() => setStepsShown(!!stepBar && stepBar.childElementCount > 0), [stepBar, pathname]);
  // What sticks under the header starts where the stuck header really ends, which wider or taller
  // text can move.
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = page.current?.querySelector(".rc-app-head");
    return header ? followAppHeader(header, document.documentElement) : undefined;
  }, [pathname, form]);
  return (
    <InformationContext.Provider value={setInformation}>
      <DockContext.Provider value={dock}>
      <StepBarContext.Provider value={stepBar}>
      {/* The section sets its accent: the current tab's bar, the page's eyebrow and step numbers (DL-050). */}
      <div className="rc-page" data-section={route?.section} ref={page}>
        <a className="rc-skip-link" href="#main">
          Skip to content
        </a>
        <AppHeader
          pathname={pathname}
          sections={!form}
          status={status}
          back={back}
          ended={ended}
        />
        {/* One canvas under every page, fixed to the window. It outlives the page, so its resting
            network grows once. */}
        <div className="rc-page-body">
          <Mycelium extent="page" home={route?.name === "home"} quiet={form} />
          <Main key={pathname} pathname={pathname} notice={<SessionEndedNotice text={ended} />}>
            {children}
          </Main>
        </div>
        {/* A focused step has no tabs. On a phone its way forward docks where they would be, and
            reads after the step and before the footer (DL-089). */}
        {form && <div className="rc-dock" ref={setDock} />}
        {/* On a wide screen a step's map and its way forward share one bar fixed to the foot of
            the window, where a phone's dock is, and it stays there in a short window too. It comes
            after the page body, so the keyboard reaches the way forward after the step's fields
            (DL-127). */}
        <div
          className="rc-step-bar"
          ref={setStepBar}
          {...(stepsShown ? { role: "region", "aria-label": "Steps and next step" } : {})}
        />
        {/* A route can leave the footer out on a phone, for focus (Route.footer). */}
        <Footer current={current} from={route?.footer} onInformation={setInformation}>
          {after}
        </Footer>
        {!form && <BottomNav pathname={pathname} />}
        {/* After the page's own content and navigation, so the keyboard reaches it last (DL-145). */}
        <Feedback pathname={pathname} form={form} />
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

/**
 * The page's content. A page reached with Back or Forward shows as the person left it, without
 * arriving again, and so does one that replaces the first view the server sent, which already arrived.
 */
function Main({ pathname, notice, children }: { pathname: string; notice: ReactNode; children: ReactNode }) {
  const [returned] = useState(() => wasReturn() || replacesFirstView(pathname));
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

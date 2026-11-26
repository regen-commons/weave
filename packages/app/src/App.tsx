import { LiveSocialProvider, SocialFixtureProvider, useSocialFixture } from "./social/context.tsx";
import { AccountDoorProvider } from "./account/door.tsx";
import { AccountProvider, useAccount } from "./account/context.tsx";
import { ForThisAccount } from "./account/SetAside.tsx";
import { useSetAside } from "./account/set-aside.ts";
import { accountKey } from "./account/document.ts";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { readFixtures, EXAMPLE_SUBJECT, type FixtureContext } from "./fixtures.ts";
import { DraftProvider } from "./describe/context.tsx";
import { useDraft } from "./describe/use-draft.ts";
import { hasDraft } from "./describe/view.ts";
import { fundingBackHref, legacyFundingHref } from "./funding/catalog.ts";
import { recoverConsentReturn } from "./initiative/consent-return.ts";
import { ProjectAccessAfterSignIn } from "./initiative/ProjectConsent.tsx";
import { headerStatus } from "./initiative/header-status.ts";
import { forgetLandingHead } from "./landing-head.ts";
import { lazyPage, type LazyPage } from "./lazy-page.ts";
import { NotFound } from "./pages/NotFound.tsx";

// Each page's code is its own file, fetched when a person first goes there (Q-02).
const Home = lazyPage(() => import("./pages/Home.tsx").then((page) => page.Home));
const StartNew = lazyPage(() => import("./pages/StartNew.tsx").then((page) => page.StartNew));
const Describe = lazyPage(() => import("./pages/Describe.tsx").then((page) => page.Describe));
const AskStep = lazyPage(() => import("./pages/AskStep.tsx").then((page) => page.AskStep));
const ListPage = lazyPage(() => import("./pages/ListPage.tsx").then((page) => page.ListPage));
const Funding = lazyPage(() => import("./pages/Funding.tsx").then((page) => page.Funding));
const Opportunity = lazyPage(() => import("./pages/Opportunity.tsx").then((page) => page.Opportunity));
const RecordDetail = lazyPage(() => import("./pages/RecordDetail.tsx").then((page) => page.RecordDetail));
const TeamWorkspace = lazyPage(() => import("./pages/TeamWorkspace.tsx").then((page) => page.TeamWorkspace));
const Settings = lazyPage(() => import("./pages/Settings.tsx").then((page) => page.Settings));
const YourInitiative = lazyPage(() => import("./pages/YourInitiative.tsx").then((page) => page.YourInitiative));
const YourInitiatives = lazyPage(() => import("./pages/YourInitiatives.tsx").then((page) => page.YourInitiatives));

/** The page code a route draws with: its own page, or the record it opens. */
function pageFor(route: Route): LazyPage<never> {
  const pages: Record<Route["name"], LazyPage<never>> = {
    home: Home,
    "new-initiative": StartNew,
    initiative: Describe,
    needs: AskStep,
    offers: AskStep,
    partners: ListPage,
    initiatives: ListPage,
    funding: Funding,
    opportunity: Opportunity,
    "initiative-detail": RecordDetail,
    "team-workspace": TeamWorkspace,
    settings: Settings,
    "your-initiative": YourInitiative,
    "your-initiatives": YourInitiatives,
  };
  return pages[route.name];
}

/** The pages an address draws: its own, and the page under a record opened as a sheet. */
function pagesAt(location: string): LazyPage<never>[] {
  const route = matchRoute(splitRoute(location).pathname);
  if (!route) return [];
  const under = route.sheet ? sheetBackground(route, currentVisit()) : null;
  const page = under ? matchRoute(splitRoute(under.route).pathname) : undefined;
  return page ? [pageFor(route), pageFor(page)] : [pageFor(route)];
}

const routeReady = (location: string): boolean => pagesAt(location).every((page) => page.ready());

/** Fetches the code for the pages at an address. The app waits for it before its first draw. */
export async function preloadPage(location: string): Promise<void> {
  await Promise.all(pagesAt(location).map((page) => page.preload()));
}
import {
  currentVisit,
  goBack,
  navigate,
  routePath,
  routeSearch,
  settleScroll,
  usePathname,
  wasReturn,
  wroteQuietly,
} from "./router.tsx";
import {
  backTarget,
  documentTitle,
  matchRoute,
  sheetBackground,
  splitRoute,
  type BackTarget,
  type Route,
} from "./routes.ts";
import type { Presentation, SheetState } from "./ui/DetailSheet.tsx";
import { Page } from "./ui/Page.tsx";
import { FixtureControls } from "./ui/FixtureControls.tsx";
import { Heading } from "./ui/Heading.tsx";
import { NarrowLayout } from "./ui/layouts.tsx";
import { DraftSkeleton } from "./ui/CardSkeleton.tsx";

function content(route: Route, search: string, fixture?: FixtureContext) {
  switch (route.name) {
    case "home":
      return <Home fixture={fixture} />;
    // The card's own pages open only for the account it belongs to (DL-055).
    case "new-initiative":
      // Not behind ForThisAccount: a new card is this account's own, whatever card the tab was on.
      return <StartNew />;
    case "initiative":
      return <ForThisAccount><Describe fixture={fixture} /></ForThisAccount>;
    case "needs":
    case "offers":
      return <ForThisAccount><AskStep key={route.name} kind={route.name} fixture={fixture} /></ForThisAccount>;
    case "partners":
    case "initiatives": {
      const list = (
        <ListPage
          key={route.name}
          title={route.title}
          kind={route.name}
          fixture={fixture}
          subject={import.meta.env.DEV && fixture?.scenario !== "visitor" ? EXAMPLE_SUBJECT : undefined}
        />
      );
      // Partners are found for the card on this device, so they follow the card's account.
      return route.name === "partners" ? <ForThisAccount>{list}</ForThisAccount> : list;
    }
    case "funding":
      return <Funding fixture={fixture} search={search} />;
    case "opportunity":
    case "initiative-detail":
      // Only a record opened from a link reaches here: over a page, it comes up as a sheet instead.
      return recordBody(route, search, { open: true, onClose: () => {} }, "page", fixture);
    case "team-workspace":
      return <TeamWorkspace key={route.id} workspaceId={route.id!} />;
    case "settings":
      return <Settings />;
    case "your-initiative":
      return <ForThisAccount><YourInitiative fixture={fixture} /></ForThisAccount>;
    case "your-initiatives":
      return <YourInitiatives fixture={fixture} />;
  }
}
/** A record's sheet. It outlives its route for a moment, so it can leave with its motion. */
interface Shown {
  readonly location: string;
  readonly route: Route;
  readonly search: string;
  /** Closed by hand, and on its way back to the page under it. */
  readonly dismissed: boolean;
}
/** Which record is on show, so a retry on the same record keeps its sheet in place. */
const recordKey = (route: Route, search: string): string =>
  `${route.name} ${route.id} ${new URLSearchParams(search).get("program") ?? ""}`;
/**
 * A fund's own page goes back to Funding as the person had it: the address keeps the list's search and
 * filters, as one opened in a new tab from a filtered list does. Every other page keeps its back link.
 */
function recordPageBack(route: Route | undefined, search: string, back: BackTarget | null): BackTarget | null {
  return route?.name === "opportunity" && back?.hops === 0 ? { ...back, href: fundingBackHref(search) } : back;
}
/** A record, as a sheet over the page it was opened from or as a page of its own. */
function recordBody(route: Route, search: string, state: SheetState, presentation: Presentation, fixture?: FixtureContext) {
  return route.name === "opportunity" ? (
    <Opportunity
      key={recordKey(route, search)}
      fundId={route.id!}
      search={search}
      fixture={fixture}
      sheet={state}
      presentation={presentation}
    />
  ) : (
    <RecordDetail
      key={recordKey(route, search)}
      id={route.id!}
      fixture={fixture}
      record={fixture?.initiatives.find((record) => record.id === route.id)}
      sheet={state}
      presentation={presentation}
    />
  );
}
/**
 * The address the app draws. It follows the address bar at once when the next page's code is here,
 * and otherwise keeps the page on screen until that code arrives, so the page never goes blank and
 * the focus and scroll that follow a move (AppFrame) always find the new page.
 */
function useDrawnLocation(): string {
  const target = usePathname();
  const [drawn, setDrawn] = useState(target);
  const ready = routeReady(target);
  useEffect(() => {
    if (ready) {
      setDrawn(target);
      return;
    }
    let current = true;
    preloadPage(target).then(
      () => { if (current) setDrawn(target); },
      // The code could not be fetched, as after a new release removed the old files: load the
      // address as a page instead, which fetches the release that has it.
      () => { if (current) window.location.reload(); },
    );
    return () => { current = false; };
  }, [target, ready]);
  return ready ? target : drawn;
}

/**
 * The wait after Certified's permission screen. index.html carries this same view, drawn at build
 * time (dev/prerender.ts), so it shows from the first paint; it is taken away before this one paints.
 */
function Returning() {
  useLayoutEffect(() => {
    document.querySelector("[data-returning-view]")?.remove();
  }, []);
  return <div className="rc-page"><main className="rc-main" id="main" tabIndex={-1}>
    <NarrowLayout><Heading level={1} size="page">Returning To Weave</Heading>
      <DraftSkeleton label="Finishing Certified permissions" /></NarrowLayout>
  </main></div>;
}

export function App() {
  const location = useDrawnLocation();
  const { pathname, search } = splitRoute(location);
  const returning = pathname === "/" && new URLSearchParams(search).has("projectConsent");
  const recovery = useRef<{ href: string; result: Promise<string> } | null>(null);
  useEffect(() => {
    if (routePath() !== "/") return;
    const target = legacyFundingHref(routeSearch());
    if (target) navigate(target, true);
  }, [location]);
  useEffect(() => {
    const callback = new URL(window.location.href);
    if (callback.pathname !== "/" || !callback.searchParams.has("projectConsent")) return;
    document.title = "Returning To Weave";
    // Effect replay shares the one-use finish request. Mount project loaders only
    // after promotion; an earlier consent-required response otherwise stays cached.
    if (recovery.current?.href !== callback.href) recovery.current = {
      href: callback.href,
      result: recoverConsentReturn(callback.searchParams.get("projectConsent"), () => window.sessionStorage),
    };
    let active = true;
    void recovery.current.result.then((destination) => {
      if (active && window.location.href === callback.href) navigate(destination, true);
    });
    return () => { active = false; };
  }, [location]);
  const fixture =
    import.meta.env.DEV && new URLSearchParams(routeSearch()).has("fixture")
      ? readFixtures(routeSearch())
      : undefined;
  if (returning) return <Returning />;
  return (
    <DraftProvider fixture={fixture}>
      <AccountProvider fixture={!!fixture}>
        {/* After a sign-in, goes on to Certified's project permission from the page it came back to (DL-137). */}
        <ProjectAccessAfterSignIn />
        {import.meta.env.DEV && fixture ? (
          <SocialFixtureProvider key={`${fixture.scenario} ${fixture.projects}`} fixture={fixture}>
            <AccountDoorProvider>
              <AppFrame key="frame" location={location} fixture={fixture} />
            </AccountDoorProvider>
          </SocialFixtureProvider>
        ) : (
          <LiveSocialProvider><AccountDoorProvider>
            <AppFrame key="frame" location={location} fixture={fixture} />
          </AccountDoorProvider></LiveSocialProvider>
        )}
      </AccountProvider>
    </DraftProvider>
  );
}
function AppFrame({ location, fixture }: { location: string; fixture?: FixtureContext }) {
  const social = useSocialFixture();
  const device = useDraft();
  const account = useAccount();
  const setAside = useSetAside();
  const saved = device.draft.account.saved;
  const accountSaved =
    !!account.state?.user &&
    account.savedCheck === "present" &&
    saved?.owner === account.state.user.id &&
    saved.contentKey === accountKey(device.draft);
  const { pathname, search } = splitRoute(location);
  const route = matchRoute(pathname);
  // A record opened inside the app comes up over the page the person was on, and that page stays as it
  // was underneath. Opened from a link, it is a page of its own.
  const under = route?.sheet ? sheetBackground(route, currentVisit()) ?? undefined : undefined;
  const sheetRoute = under ? route : undefined;
  const pageLocation = under ? splitRoute(under.route) : { pathname, search };
  const pagePath = pageLocation.pathname;
  const pageRoute = under ? matchRoute(pagePath) : route;
  const [shown, setShown] = useState<Shown>();
  // Kept in step while rendering: the sheet on screen, until one closed by hand has left its route.
  if (sheetRoute ? shown?.location !== location : shown?.dismissed) {
    setShown(
      sheetRoute
        ? { location, route: sheetRoute, search, dismissed: false }
        : undefined,
    );
  }
  function sheetClosed() {
    if (!shown) return;
    if (!sheetRoute || !under || shown.location !== location) {
      // It finished leaving after the route had already moved on, as the browser's Back does.
      setShown(undefined);
      return;
    }
    // Closed by hand: return to the page under it, where the person left it.
    setShown({ ...shown, dismissed: true });
    goBack(under.hops);
  }
  // The page keeps the back link it had before a record opened over it.
  const pageBack = useRef<{ path: string; target: BackTarget | null }>(null);
  const back = !sheetRoute
    ? recordPageBack(pageRoute, search, backTarget(pageRoute, currentVisit()))
    : pageBack.current?.path === pagePath
      ? pageBack.current.target
      : backTarget(pageRoute, null);
  useEffect(() => {
    if (!sheetRoute) pageBack.current = { path: pagePath, target: back };
  });
  const last = useRef({ location, pagePath, sheet: !!sheetRoute });
  // A page that was reloaded, or dropped in the background and loaded again, opens where it was left.
  useEffect(() => {
    if (wasReturn()) settleScroll();
  }, []);
  useEffect(() => {
    // A record, open as a sheet or as a page, names the document itself.
    if (!route?.sheet) document.title = documentTitle(pageRoute);
    const before = last.current;
    if (before.location === location) return;
    // The landing page's canonical link and JSON-LD would now name the wrong page.
    forgetLandingHead(document.head);
    last.current = { location, pagePath, sheet: !!sheetRoute };
    // A sheet opening or closing leaves the page under it where it was.
    if ((before.sheet || sheetRoute) && before.pagePath === pagePath) return;
    // So does a filter the page wrote into its own address.
    if (before.pagePath === pagePath && wroteQuietly(location)) return;
    settleScroll();
    document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
  }, [location, route?.name]);
  const status = headerStatus({
    page: pageRoute?.name,
    setAside: !!setAside,
    accountSaved: accountSaved || (import.meta.env.DEV && !!fixture && !!social?.state.saved),
    storage: device.storage,
  });
  return (
    <Page
      pathname={pagePath}
      form={pageRoute?.form ?? true}
      status={status}
      back={back}
      current={pageRoute?.name}
      sheet={
        shown && !shown.dismissed
          ? <Suspense fallback={null}>{recordBody(
              shown.route,
              shown.search,
              { open: !!sheetRoute && shown.location === location, onClose: sheetClosed },
              "sheet",
              fixture,
            )}</Suspense>
          : null
      }
      runs={device.draft.runs}
      after={
        import.meta.env.DEV &&
        fixture &&
        !(__WEAVE_PROTOTYPE__ && window.parent !== window) && <FixtureControls fixture={fixture} />
      }
    >
      {pageRoute ? <Suspense fallback={null}>{content(pageRoute, pageLocation.search, fixture)}</Suspense> : <NotFound />}
    </Page>
  );
}

import { SocialFixtureProvider, useSocialFixture } from "./social/context.tsx";
import { AccountDoorProvider } from "./account/door.tsx";
import { AccountProvider, useAccount } from "./account/context.tsx";
import { accountKey } from "./account/document.ts";
import { useEffect, useRef, useState } from "react";
import { readFixtures, EXAMPLE_SUBJECT, type FixtureContext } from "./fixtures.ts";
import { DraftProvider } from "./describe/context.tsx";
import { useDraft } from "./describe/use-draft.ts";
import { hasDraft } from "./describe/view.ts";
import { Describe } from "./pages/Describe.tsx";
import { CheckCard } from "./pages/CheckCard.tsx";
import { Home } from "./pages/Home.tsx";
import { AskStep } from "./pages/AskStep.tsx";
import { YourInitiative } from "./pages/YourInitiative.tsx";
import { YourInitiatives } from "./pages/YourInitiatives.tsx";
import { Funding } from "./pages/Funding.tsx";
import { Opportunity } from "./pages/Opportunity.tsx";
import { fundingBackHref, legacyFundingHref } from "./funding/catalog.ts";
import { ListPage } from "./pages/ListPage.tsx";
import { RecordDetail } from "./pages/RecordDetail.tsx";
import { TeamWorkspace } from "./pages/TeamWorkspace.tsx";
import { finishConsentReturn, takeConsentReturn } from "./initiative/consent-return.ts";
import { Settings } from "./pages/Settings.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import {
  currentVisit,
  goBack,
  navigate,
  routePath,
  routeSearch,
  settleScroll,
  usePathname,
  wroteQuietly,
} from "./router.tsx";
import {
  backTarget,
  documentTitle,
  fixtureHref,
  matchRoute,
  sheetBackground,
  splitRoute,
  type BackTarget,
  type Route,
} from "./routes.ts";
import type { SheetState } from "./ui/DetailSheet.tsx";
import { Page } from "./ui/Page.tsx";
import { FixtureControls } from "./ui/FixtureControls.tsx";

function content(route: Route, fixture?: FixtureContext) {
  switch (route.name) {
    case "home":
      return <Home fixture={fixture} />;
    case "initiative":
      return <Describe fixture={fixture} />;
    case "check-card":
      return <CheckCard />;
    case "needs":
    case "offers":
      return <AskStep key={route.name} kind={route.name} fixture={fixture} />;
    case "partners":
    case "initiatives":
      return (
        <ListPage
          key={route.name}
          title={route.title}
          kind={route.name}
          fixture={fixture}
          subject={import.meta.env.DEV && fixture?.scenario !== "visitor" ? EXAMPLE_SUBJECT : undefined}
        />
      );
    case "funding":
      return <Funding fixture={fixture} />;
    case "opportunity":
    case "initiative-detail":
      // A record opens over a page as a sheet; it is never the page itself.
      return null;
    case "team-workspace":
      return <TeamWorkspace key={route.id} workspaceId={route.id!} />;
    case "settings":
      return <Settings />;
    case "your-initiative":
      return <YourInitiative fixture={fixture} />;
    case "your-initiatives":
      return <YourInitiatives />;
  }
}
/** A record's sheet. It outlives its route for a moment, so it can leave with its motion. */
interface Shown {
  /** The record on show, so a retry on the same record keeps its sheet in place. */
  readonly record: string;
  readonly location: string;
  readonly route: Route;
  readonly search: string;
  /** Closed by hand, and on its way back to the page under it. */
  readonly dismissed: boolean;
}
const recordKey = (route: Route, search: string): string =>
  `${route.name} ${route.id} ${new URLSearchParams(search).get("program") ?? ""}`;
function sheetBody(shown: Shown, state: SheetState, fixture?: FixtureContext) {
  return shown.route.name === "opportunity" ? (
    <Opportunity
      key={shown.record}
      fundId={shown.route.id!}
      search={shown.search}
      fixture={fixture}
      sheet={state}
    />
  ) : (
    <RecordDetail
      key={shown.record}
      fixture={fixture}
      record={fixture?.initiatives.find((record) => record.id === shown.route.id)}
      sheet={state}
    />
  );
}
export function App() {
  const location = usePathname();
  useEffect(() => {
    if (routePath() !== "/") return;
    const target = legacyFundingHref(routeSearch());
    if (target) navigate(target, true);
  }, [location]);
  useEffect(() => {
    const callback = new URL(window.location.href);
    if (callback.pathname !== "/" || !callback.searchParams.has("projectConsent")) return;
    const pending = takeConsentReturn(callback.searchParams.get("projectConsent"), () => window.sessionStorage);
    if (!pending) return;
    void finishConsentReturn(pending).then((destination) => {
      if (window.location.href === callback.href) navigate(destination, true);
    });
  }, [location]);
  const fixture =
    import.meta.env.DEV && new URLSearchParams(routeSearch()).has("fixture")
      ? readFixtures(routeSearch())
      : undefined;
  return (
    <DraftProvider fixture={fixture}>
      <AccountProvider fixture={!!fixture}>
        {import.meta.env.DEV && fixture ? (
          <SocialFixtureProvider key={`${fixture.scenario} ${fixture.projects}`} fixture={fixture}>
            <AccountDoorProvider>
              <AppFrame key="frame" location={location} fixture={fixture} />
            </AccountDoorProvider>
          </SocialFixtureProvider>
        ) : (
          <AccountDoorProvider>
            <AppFrame key="frame" location={location} fixture={fixture} />
          </AccountDoorProvider>
        )}
      </AccountProvider>
    </DraftProvider>
  );
}
function AppFrame({ location, fixture }: { location: string; fixture?: FixtureContext }) {
  const social = useSocialFixture();
  const device = useDraft();
  const account = useAccount();
  const saved = device.draft.account.saved;
  const accountSaved =
    !!account.state?.user &&
    saved?.owner === account.state.user.id &&
    saved.contentKey === accountKey(device.draft);
  const { pathname, search } = splitRoute(location);
  const route = matchRoute(pathname);
  // A record opens over the page the person was on, and that page stays as it was underneath.
  const sheetRoute = route?.sheet ? route : undefined;
  const under = sheetRoute ? sheetBackground(sheetRoute, currentVisit()) : undefined;
  const pagePath = under ? splitRoute(under.route).pathname : pathname;
  const pageRoute = under ? matchRoute(pagePath) : route;
  const [shown, setShown] = useState<Shown>();
  // Kept in step while rendering: the sheet on screen, until one closed by hand has left its route.
  if (sheetRoute ? shown?.location !== location : shown?.dismissed) {
    setShown(
      sheetRoute
        ? { record: recordKey(sheetRoute, search), location, route: sheetRoute, search, dismissed: false }
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
    if (under.hops > 0) goBack(under.hops);
    else {
      const list = sheetRoute.name === "opportunity" ? fundingBackHref(search) : under.route;
      navigate(fixtureHref(list, search, import.meta.env.DEV), true);
    }
  }
  // The page keeps the back link it had before a record opened over it.
  const pageBack = useRef<{ path: string; target: BackTarget | null }>(null);
  const back = !sheetRoute
    ? backTarget(pageRoute, currentVisit())
    : pageBack.current?.path === pagePath
      ? pageBack.current.target
      : backTarget(pageRoute, null);
  useEffect(() => {
    if (!sheetRoute) pageBack.current = { path: pagePath, target: back };
  });
  const last = useRef({ location, pagePath, sheet: !!sheetRoute });
  useEffect(() => {
    // An open sheet names the document itself.
    if (!sheetRoute) document.title = documentTitle(pageRoute);
    const before = last.current;
    if (before.location === location) return;
    last.current = { location, pagePath, sheet: !!sheetRoute };
    // A sheet opening or closing leaves the page under it where it was.
    if ((before.sheet || sheetRoute) && before.pagePath === pagePath) return;
    // So does a filter the page wrote into its own address.
    if (before.pagePath === pagePath && wroteQuietly(location)) return;
    settleScroll();
    document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
  }, [location, route?.name]);
  const status =
    accountSaved || (import.meta.env.DEV && !!fixture && social?.state.saved)
      ? "account"
      : fixture && !["initiative", "check-card", "needs", "offers", "your-initiative"].includes(pageRoute?.name ?? "")
        ? (social ? social.state.saved : ["private", "workspace", "shared", "published"].includes(fixture?.scenario ?? ""))
          ? "account"
          : fixture?.scenario === "draft"
            ? "device"
            : "none"
        : device.storage === "saving"
          ? "saving"
          : device.storage === "memory"
            ? "memory"
            : device.storage === "conflict"
              ? "conflict"
              : device.storage === "saved" && hasDraft(device.draft)
                ? "device"
                : "none";
  return (
    <Page
      pathname={pagePath}
      form={pageRoute?.form ?? true}
      status={status}
      back={back}
      current={pageRoute?.name}
      sheet={
        shown && !shown.dismissed
          ? sheetBody(
              shown,
              { open: !!sheetRoute && shown.location === location, onClose: sheetClosed },
              fixture,
            )
          : null
      }
      runs={device.draft.runs}
      after={
        import.meta.env.DEV &&
        fixture &&
        !(__WEAVE_PROTOTYPE__ && window.parent !== window) && <FixtureControls fixture={fixture} />
      }
    >
      {pageRoute ? content(pageRoute, fixture) : <NotFound />}
    </Page>
  );
}

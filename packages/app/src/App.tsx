import { SocialFixtureProvider, useSocialFixture } from "./social/context.tsx";
import { AccountDoorProvider } from "./account/door.tsx";
import { AccountProvider, useAccount } from "./account/context.tsx";
import { accountKey } from "./account/document.ts";
import { useEffect, useRef } from "react";
import { readFixtures, EXAMPLE_SUBJECT, type FixtureContext } from "./fixtures.ts";
import { DraftProvider } from "./describe/context.tsx";
import { useDraft } from "./describe/use-draft.ts";
import { hasDraft } from "./describe/view.ts";
import { Describe } from "./pages/Describe.tsx";
import { CheckCard } from "./pages/CheckCard.tsx";
import { Home } from "./pages/Home.tsx";
import { AskStep } from "./pages/AskStep.tsx";
import { Finish } from "./pages/Finish.tsx";
import { Funding } from "./pages/Funding.tsx";
import { Opportunity } from "./pages/Opportunity.tsx";
import { legacyFundingHref } from "./funding/catalog.ts";
import { ListPage } from "./pages/ListPage.tsx";
import { RecordDetail } from "./pages/RecordDetail.tsx";
import { Settings } from "./pages/Settings.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import { navigate, usePathname } from "./router.tsx";
import { documentTitle, matchRoute, type Route } from "./routes.ts";
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
      return (
        <Opportunity
          key={`${route.id}-${new URLSearchParams(location.search).get("program")}`}
          fundId={route.id!}
          fixture={fixture}
        />
      );
    case "initiative-detail":
      return (
        <RecordDetail
          fixture={fixture}
          record={fixture?.initiatives.find((record) => record.id === route.id)}
        />
      );
    case "settings":
      return <Settings />;
    case "finish":
      return <Finish fixture={fixture} />;
  }
}
export function App() {
  const location = usePathname();
  useEffect(() => {
    if (window.location.pathname !== "/") return;
    const target = legacyFundingHref(window.location.search);
    if (target) navigate(target, true);
  }, [location]);
  const fixture =
    import.meta.env.DEV && new URLSearchParams(window.location.search).has("fixture")
      ? readFixtures(window.location.search)
      : undefined;
  return (
    <DraftProvider fixture={fixture}>
      <AccountProvider fixture={!!fixture}>
        {import.meta.env.DEV && fixture ? (
          <SocialFixtureProvider key={fixture.scenario} scenario={fixture.scenario}>
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
  const pathname = new URL(location, window.location.origin).pathname;
  const route = matchRoute(pathname);
  const shownPath = useRef(location);
  const record = route?.id
    ? (route.name === "opportunity" ? fixture?.funding : fixture?.initiatives)?.find(
        (item) => item.id === route.id,
      )
    : undefined;
  useEffect(() => {
    document.title = record ? `${record.title} | Weave` : documentTitle(route);
    if (shownPath.current === location) return;
    shownPath.current = location;
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
  }, [location, route?.name, record?.title]);
  const status =
    accountSaved || (import.meta.env.DEV && !!fixture && social?.state.saved)
      ? "account"
      : fixture && !["initiative", "check-card", "needs", "offers", "finish"].includes(route?.name ?? "")
        ? (social ? social.state.saved : fixture?.scenario === "private" || fixture?.scenario === "shared")
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
    <Page pathname={pathname} form={route?.form ?? true} status={status} runs={device.draft.runs}>
      {import.meta.env.DEV && fixture && <FixtureControls fixture={fixture} />}
      {route ? content(route, fixture) : <NotFound />}
    </Page>
  );
}

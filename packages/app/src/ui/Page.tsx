import { InformationContext } from "./information-context.ts";
import { useState, type ReactNode } from "react";
import type { BackTarget, RouteName } from "../routes.ts";
import { AppHeader, type SaveStatus } from "./AppHeader.tsx";
import { wasReturn } from "../router.tsx";
import { BottomNav } from "./BottomNav.tsx";
import { Footer } from "./Footer.tsx";
import { InformationDialog, type Information } from "./InformationDialog.tsx";
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
  return (
    <InformationContext.Provider value={setInformation}>
      <div className="rc-page">
        <a className="rc-skip-link" href="#main">
          Skip to content
        </a>
        <p className="rc-site-banner">Still in development will be live soon</p>
        <AppHeader pathname={pathname} sections={!form} status={status} back={back} />
        <Main key={pathname}>{children}</Main>
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
    </InformationContext.Provider>
  );
}

/** The page's content. A page reached with Back or Forward shows as the person left it, without arriving again. */
function Main({ children }: { children: ReactNode }) {
  const [returned] = useState(wasReturn);
  return (
    <main className="rc-main" id="main" tabIndex={-1} data-move={returned ? "return" : undefined}>
      {children}
    </main>
  );
}

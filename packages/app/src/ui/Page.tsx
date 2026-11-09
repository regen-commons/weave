import { InformationContext } from "./information-context.ts";
import { useState, type ReactNode } from "react";
import { AppHeader, type SaveStatus } from "./AppHeader.tsx";
import { BottomNav } from "./BottomNav.tsx";
import { Footer } from "./Footer.tsx";
import { InformationDialog, type Information } from "./InformationDialog.tsx";
export function Page({
  pathname,
  form,
  status,
  children,
  runs,
}: {
  pathname: string;
  form: boolean;
  status: SaveStatus;
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
        <AppHeader pathname={pathname} sections={!form} status={status} />
        <main key={pathname} className="rc-main" id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer slim={form} onInformation={setInformation} />
        {!form && <BottomNav pathname={pathname} />}
        <InformationDialog
          runs={runs}
          information={information}
          onClose={() => setInformation(null)}
          onPolicy={() => setInformation("policy")}
        />
      </div>
    </InformationContext.Provider>
  );
}

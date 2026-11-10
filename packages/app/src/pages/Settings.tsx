import { useState } from "react";
import { AccountSection } from "../account/AccountSection.tsx";
import { SignOutAction } from "../account/SignOutAction.tsx";
import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { revise } from "../describe/contracts.ts";
import { deviceExport } from "../data/export.ts";
import { blobDataUrl, downloadJson } from "../data/download.ts";
import { applyTheme, readTheme, type Theme } from "../theme.ts";
import { useSocialFixture } from "../social/context.tsx";
import { useAccountDoor } from "../account/door.tsx";
import { hasDraft } from "../describe/view.ts";
import { cardName, cardRoute } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { Link } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { Heading } from "../ui/Heading.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { SettingsSection } from "../ui/SettingsSection.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { useInformation } from "../ui/information-context.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
export function Settings() {
  const [theme, setTheme] = useState(readTheme);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { draft, controller, ready } = useDraft();
  const account = useAccount();
  const example = useSocialFixture();
  const status = useCardStatus();
  const openDoor = useAccountDoor();
  const information = useInformation();
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This change could not be completed. Your data is unchanged.",
      );
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rc-narrow rc-settings">
      <Heading level={1} size="page">
        Settings
      </Heading>
      <SettingsSection title="Your initiative">
        {hasDraft(draft) ? (
          <>
            <StatusLine
              state={status.state}
              actions={
                <ButtonLink href={pathTo(cardRoute(draft))} variant="secondary" size="sm">
                  Open
                </ButtonLink>
              }
            >
              <strong>{cardName(draft)}</strong>. {status.line}
            </StatusLine>
            {import.meta.env.DEV && example ? (
              <p className="rc-meta">Fictional account choices. Nothing is published.</p>
            ) : (
              <AccountSection showLeave={false} />
            )}
          </>
        ) : (
          <>
            <p>No initiative on this device yet.</p>
            <ButtonLink href={pathTo("initiative")} variant="secondary">
              Describe your initiative
            </ButtonLink>
          </>
        )}
      </SettingsSection>
      <SettingsSection title="Account">
        {import.meta.env.DEV && example ? (
          example.state.identity ? (
            <>
              <p>Signed in with Certified as {example.state.identity.handle}. No email is stored.</p>
              <p className="rc-meta">
                Reminders and updates will ask for a way to reach you when you turn one on.
              </p>
            </>
          ) : (
            <>
              <p>Not signed in. Your initiative stays on this device until you save it.</p>
              <button
                className="rc-button"
                data-variant="secondary"
                type="button"
                onClick={() => openDoor("sign-in")}
              >
                Sign in with Certified
              </button>
            </>
          )
        ) : (
          <>
            <p>
              {account.state?.user
                ? "Signed in with Certified."
                : "Sign in with Certified when you want a private saved copy."}
            </p>
            <p className="rc-meta">
              Certified handles sign-in. Weave does not keep an email address from sign-in. Reminders and
              introductions will need separate contact details and permission.
            </p>
          </>
        )}
      </SettingsSection>
      <SettingsSection title="Assistant">
        <p>
          {draft.assistant === "browser"
            ? "Browser model selected. It runs only when already available and you build a card."
            : draft.assistant === "none"
              ? "Your card is entered by hand."
              : "Keyword rules run on this device. No model download is needed."}
        </p>
        <p className="rc-meta">
          Downloaded and cloud models are not connected. No words are sent to a cloud model.
        </p>
        {draft.assistant === "browser" && (
          <button
            className="rc-button"
            data-variant="secondary"
            type="button"
            onClick={() => controller.change((current) => revise(current, { assistant: "keywords" }))}
          >
            Use keywords instead
          </button>
        )}
        <button
          className="rc-button"
          data-variant="quiet"
          type="button"
          onClick={() => information("assistant")}
        >
          What the assistant did
        </button>
      </SettingsSection>
      <SettingsSection title="Appearance">
        <div className="rc-field">
          <label htmlFor="appearance">Appearance</label>
          <select
            className="rc-input"
            id="appearance"
            value={theme}
            onChange={(event) => {
              const value = event.target.value as Theme;
              setTheme(value);
              applyTheme(value);
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <p className="rc-hint">Choose a theme for this device.</p>
        </div>
      </SettingsSection>
      <SettingsSection title="Your data">
        <p>
          Download this device's current draft, unfinished words, files, assistant records and backups. It
          does not fetch other account cards. Keep the file private.
        </p>
        <button
          className="rc-button"
          data-variant="secondary"
          type="button"
          disabled={busy || !ready}
          onClick={() =>
            void perform(async () => {
              await controller.settled();
              const data = await deviceExport(
                controller.getSnapshot().draft,
                await controller.backups(),
                theme,
                blobDataUrl,
              );
              downloadJson("weave-device-data.json", data);
              setMessage(
                "Device snapshot download started, including files and backups. Other account cards were not fetched.",
              );
            })
          }
        >
          {busy ? "Preparing your data" : "Download device data"}
        </button>
        <button
          className="rc-button"
          data-variant="quiet"
          type="button"
          onClick={() => information("storage")}
        >
          What we store
        </button>
      </SettingsSection>
      <SettingsSection title="Leave" leave>
        {import.meta.env.DEV && example ? (
          <>
            <p>This example changes no real account.</p>
            {example.state.identity ? (
              <div className="rc-action-bar">
                <button
                  className="rc-button"
                  data-variant="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await example.service.signOut();
                      example.refresh();
                      setMessage("You are signed out. The card on this device is still here.");
                    })
                  }
                >
                  Sign out
                </button>
                <button
                  className="rc-button"
                  data-variant="quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleting(true)}
                >
                  Delete the example
                </button>
              </div>
            ) : (
              <p>No example account is signed in. Reloading restores the seeded example.</p>
            )}
            {(status.state === "shared" || status.state === "published") && (
              <p className="rc-meta">
                Signing out does not stop sharing or withdraw a listing. Do that from{" "}
                <Link href={pathTo("your-initiative")}>your initiative</Link>.
              </p>
            )}
          </>
        ) : (
          <>
            <SignOutAction
              label="Sign out of this device"
              onResult={(text, error) => {
                setMessage(text);
                setFailed(error);
              }}
            />
            <p className="rc-meta">
              Self-service account deletion is not connected yet.{" "}
              <a href="https://regencommons.com">Contact Regen Commons</a> about deleting account copies.
              Sign-out keeps this device's draft and backups.
            </p>
          </>
        )}
      </SettingsSection>
      {message && (
        <p className="rc-notice" data-tone={failed ? "warning" : "info"} role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
      {import.meta.env.DEV && example && (
        <TaskDialog title="Delete the example?" open={deleting} onClose={() => setDeleting(false)}>
          <p>
            This clears only this page's in-memory account, choices and requests. Reloading restores its
            seeded example. No Supabase account, initiative or device draft is deleted.
          </p>
          <button
            className="rc-button"
            data-variant="danger"
            type="button"
            disabled={busy || !example.state.identity}
            onClick={() =>
              void perform(async () => {
                await example.service.deleteAccount();
                example.refresh();
                setDeleting(false);
                setMessage("Example account cleared. No real record was deleted.");
              })
            }
          >
            Clear the example account
          </button>
        </TaskDialog>
      )}
    </div>
  );
}

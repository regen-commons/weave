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
import { SocialAction } from "../social/Action.tsx";
import { Heading } from "../ui/Heading.tsx";
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
        <p>{draft.confirmed?.name ?? "Your draft stays on this device until you choose to save."}</p>
        <p className="rc-meta">
          {import.meta.env.DEV && example
            ? "Fictional account choices. Nothing is published."
            : "Saved account copies are private. Community sharing is not connected yet."}
        </p>
        {import.meta.env.DEV && example ? (
          <SocialAction intent={{ kind: "share" }} inline />
        ) : (
          <AccountSection showLeave={false} />
        )}
        <ButtonLink href="/start/initiative" variant="quiet">
          Change your card
        </ButtonLink>
      </SettingsSection>
      <SettingsSection title="Sign-in and contact">
        <p>
          {import.meta.env.DEV && example
            ? (example.state.signedIn ? "Signed in to the Certified example." : "Not signed in to the example.")
            : (account.state?.user ? "Signed in with Certified." : "Sign in with Certified when you want a private saved copy.")}
        </p>
        <p className="rc-meta">
          Certified handles sign-in. Weave does not keep an email address from sign-in. Reminders and introductions
          will need separate contact details and permission.
        </p>
        {import.meta.env.DEV && example?.state.signedIn && (
          <fieldset className="rc-choice-group">
            <legend>Example email choices</legend>
            {(
              [
                ["funding", "Funding reminders"],
                ["partners", "New partners"],
                ["introductions", "Introductions"],
              ] as const
            ).map(([kind, label]) => (
              <label className="rc-choice" key={kind}>
                <input
                  className="rc-switch"
                  type="checkbox"
                  role="switch"
                  checked={example.state.notifications[kind]}
                  disabled={busy || (kind === "partners" && example.state.visibility !== "public")}
                  onChange={(event) =>
                    void perform(async () => {
                      await example.service.notify(kind, event.target.checked);
                      example.refresh();
                      setMessage("Example email choice changed. No email will be sent.");
                    })
                  }
                />
                <span className="rc-choice-text">
                  <span className="rc-choice-title">{label}</span>
                  <span className="rc-choice-note">
                    {kind === "partners" && example.state.visibility !== "public"
                      ? "Requires a shared example initiative."
                      : "Off until you choose. This is an in-memory example."}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
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
            {example.state.signedIn ? (
              <button
                className="rc-button"
                data-variant="secondary"
                type="button"
                onClick={() => setDeleting(true)}
              >
                Delete the example
              </button>
            ) : (
              <p>No example account is signed in. Reloading restores the seeded example.</p>
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
            disabled={busy || !example.state.signedIn}
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

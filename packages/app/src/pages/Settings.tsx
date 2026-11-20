import { useRef, useState } from "react";
import { AccountSection } from "../account/AccountSection.tsx";
import { SignOutAction } from "../account/SignOutAction.tsx";
import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { revise } from "../describe/contracts.ts";
import { deviceExport } from "../data/export.ts";
import { blobDataUrl, downloadJson } from "../data/download.ts";
import { applyTheme, THEME_CHOICES, type Theme } from "../theme.ts";
import { deviceConsent } from "../describe/speech-consent.ts";
import { useBrowserSpeechAgreement } from "../describe/use-speech.ts";
import { SPEECH_SETTING } from "../describe/speech-setup.ts";
import { useTheme } from "../ui/ThemeSwitch.tsx";
import { SignInButton } from "../account/SignInButton.tsx";
import { COMMONS } from "../links.ts";
import { useSocialFixture } from "../social/context.tsx";
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
import { AboutCertified } from "../ui/AboutCertified.tsx";
import { InstallGuide } from "../install/InstallGuide.tsx";
import { DeviceBackups } from "../data/DeviceBackups.tsx";
import { SignInReturnNotice } from "../account/SignInReturnNotice.tsx";
export function Settings() {
  const { theme } = useTheme();
  const browserSpeech = useBrowserSpeechAgreement();
  // Withdrawing removes its own button, so the line that says what changed takes the focus.
  const speechLine = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { draft, controller, ready } = useDraft();
  const account = useAccount();
  const example = useSocialFixture();
  const status = useCardStatus();
  const information = useInformation();
  const accountTask = !(import.meta.env.DEV && example) && hasDraft(draft);
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
    <div className="rc-settings">
      <Heading level={1} size="page">
        Settings
      </Heading>
      <SettingsSection title="Your Initiative" note="The card kept on this device.">
        {hasDraft(draft) ? (
          <StatusLine
            actions={
              <ButtonLink href={pathTo(cardRoute(draft))} variant="secondary" size="sm">
                Open
              </ButtonLink>
            }
          >
            <strong>{cardName(draft)}</strong>. {status.line}
          </StatusLine>
        ) : (
          <>
            <p>No initiative on this device yet.</p>
            <div className="rc-action-bar">
              <ButtonLink href={pathTo("new-initiative")} variant="secondary">
                Describe Your Initiative
              </ButtonLink>
            </div>
          </>
        )}
      </SettingsSection>
      <SettingsSection title="Account" note="You sign in with Certified.">
        {import.meta.env.DEV && example ? (
          example.state.identity ? (
            <>
              <p>Signed in with Certified as {example.state.identity.handle}. No email is stored.</p>
              <p className="rc-meta">
                Reminders and updates will ask for a way to reach you when you turn one on.
              </p>
              <div className="rc-action-bar">
                <AboutCertified />
              </div>
            </>
          ) : (
            <>
              <p>Not signed in. Your initiative stays on this device until you save it.</p>
              <div className="rc-action-bar">
                <SignInButton variant="secondary" />
                <AboutCertified />
              </div>
              <SignInReturnNotice />
            </>
          )
        ) : (
          <>
            {/* With a card on this device, the account's saved cards and saving live here, once. */}
            {accountTask ? (
              <AccountSection showLeave={false} heading={false} showBackups={false} />
            ) : account.state?.user ? (
              <p>Signed in with Certified.</p>
            ) : (
              <>
                <p>Not signed in. Sign in with Certified when you want a private saved copy.</p>
                <div className="rc-action-bar">
                  <SignInButton variant="secondary" />
                </div>
                <SignInReturnNotice />
              </>
            )}
            <p className="rc-meta">
              Certified handles sign-in. Weave does not keep an email address from sign-in. Reminders and
              introductions will need separate contact details and permission.
            </p>
            {/* The sign-in offer already explains Certified, so the explanation shows once. */}
            {!(accountTask && account.state?.available && !account.state.user) && (
              <div className="rc-action-bar">
                <AboutCertified />
              </div>
            )}
          </>
        )}
      </SettingsSection>
      <SettingsSection title="Appearance" note="Light, dark, or the same as this device.">
        <div className="rc-field">
          <label htmlFor="appearance">Theme</label>
          <select
            className="rc-input"
            id="appearance"
            value={theme}
            onChange={(event) => applyTheme(event.target.value as Theme)}
          >
            {THEME_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
      </SettingsSection>
      <SettingsSection title="Assistant" note="How your words are read.">
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
        <div className="rc-action-bar">
          {draft.assistant === "browser" && (
            <button
              className="rc-button"
              data-variant="secondary"
              type="button"
              onClick={() => controller.change((current) => revise(current, { assistant: "keywords" }))}
            >
              Use Keywords Instead
            </button>
          )}
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            onClick={() => information("assistant")}
          >
            What The Assistant Did
          </button>
        </div>
      </SettingsSection>
      <SettingsSection title="Speech" note="How talking turns into text.">
        <p role="status" ref={speechLine} tabIndex={-1}>
          {browserSpeech ? SPEECH_SETTING.agreed : SPEECH_SETTING.notAgreed}
        </p>
        {browserSpeech && (
          <div className="rc-action-bar">
            <button
              className="rc-button"
              data-variant="secondary"
              type="button"
              onClick={() => {
                deviceConsent().withdraw();
                speechLine.current?.focus();
              }}
            >
              {SPEECH_SETTING.withdraw}
            </button>
          </div>
        )}
      </SettingsSection>
      <SettingsSection title="Install Weave On Your Phone" note="It opens like an app, full screen.">
        <InstallGuide />
      </SettingsSection>
      <SettingsSection title="Your Data" note="A copy of what this device holds.">
        <p>
          Download this device's draft, unfinished words, files, assistant records and backups. Cards
          saved in your account are not included. Keep the file private.
        </p>
        <div className="rc-action-bar">
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
            {busy ? "Preparing Your Data" : "Download Device Data"}
          </button>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            onClick={() => information("storage")}
          >
            What We Store
          </button>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            onClick={() => information("policy")}
          >
            Data Policy
          </button>
        </div>
      </SettingsSection>
      {/* Backups and removal stay here even when no draft is left on the device, so recovery stays in reach. */}
      <SettingsSection
        title="Device Backups"
        note="Earlier drafts and their files, kept only in this browser. Restoring one opens it as its own draft, and a draft it replaces is backed up first."
      >
        <DeviceBackups manage disabled={busy} />
      </SettingsSection>
      {!(import.meta.env.DEV && example && !example.state.identity) && (
        <SettingsSection title="Leave" note="Signing out keeps what is on this device.">
          {import.meta.env.DEV && example ? (
            <>
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
                  Sign Out
                </button>
                <button
                  className="rc-button"
                  data-variant="quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleting(true)}
                >
                  Delete Your Account
                </button>
              </div>
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
                label="Sign Out Of This Device"
                onResult={(text, error) => {
                  setMessage(text);
                  setFailed(error);
                }}
              />
              <p className="rc-meta">
                Deleting a whole account is not available in Weave yet. You can delete a saved card in{" "}
                <Link href={pathTo("your-initiatives")}>Your Initiatives</Link>, and{" "}
                <Link href={COMMONS.website}>contact Regen Commons</Link> about the rest.
              </p>
            </>
          )}
        </SettingsSection>
      )}
      {message && (
        <p className="rc-notice" data-tone={failed ? "warning" : "info"} role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
      {import.meta.env.DEV && example && (
        <TaskDialog title="Delete Your Account?" open={deleting} onClose={() => setDeleting(false)}>
          <p>
            This deletes the initiatives you saved privately in Weave and takes back anything you shared.
            Your Certified account is not deleted, and the card on this device stays.
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
                setMessage("Your Weave account is deleted. The card on this device is still here.");
              })
            }
          >
            Delete My Account
          </button>
        </TaskDialog>
      )}
    </div>
  );
}

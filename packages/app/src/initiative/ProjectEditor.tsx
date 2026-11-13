import { useEffect, useId, useRef, useState } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { useSocial } from "../social/context.tsx";
import { beginEditorHandoff, editorStorage, PROJECT_EDITORS, readEditorHandoff, type ProjectEditor } from "./editor-handoff.ts";
import { projectCreationKey } from "./project-creation.ts";
import { NewProject } from "./NewProject.tsx";

export const EXAMPLE_EDITOR_OWNER = import.meta.env.DEV ? "10000000-0000-4000-8000-000000000099" : "";

/** Navigation is separate from publication and linking. Nothing is sent to an editor. */
export function ProjectEditorStep({ onCancel, onCreated }: { onCancel(): void; onCreated(): void }) {
  const social = useSocial();
  const { draft, controller } = useDraft();
  const owner = social?.state.identity?.id ?? (social?.mode === "fixture" ? EXAMPLE_EDITOR_OWNER : "");
  const lifetime = useRef<AbortController | null>(null);
  const running = useRef(false);
  const editorName = useId();
  const [editor, setEditor] = useState<ProjectEditor>(() => readEditorHandoff(editorStorage(() => window.sessionStorage), owner, draft.id)?.editor ?? "certified");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    const current = new AbortController(); lifetime.current = current;
    return () => current.abort();
  }, [owner, draft.id]);
  if (!social) return null;
  const storage = editorStorage(() => window.sessionStorage);
  let earlier = false;
  try { earlier = storage?.getItem(projectCreationKey(owner, draft.id)) !== null && storage !== undefined; }
  catch { earlier = true; }
  if (earlier && social.mode === "live") return <div className="rc-stack"><NewProject onDone={onCreated} />
    <button className="rc-button" data-variant="quiet" type="button" onClick={onCancel}>Keep working in Weave</button></div>;
  const pending = readEditorHandoff(storage, owner, draft.id);
  async function leave() {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || running.current || !social) return;
    running.current = true; setBusy(true); setMessage("");
    try {
      await beginEditorHandoff({ controller, storage, owner, editor, signal,
        isCurrent: () => (social.service.snapshot().identity?.id ?? (social.mode === "fixture" ? EXAMPLE_EDITOR_OWNER : "")) === owner,
        navigate: target => {
          if (import.meta.env.DEV && social.mode === "fixture") setMessage(`Example only. ${PROJECT_EDITORS[editor].name} would open here. No project was created.`);
          else if (import.meta.env.DEV && social.synthetic) window.location.assign(`/__fixture?editor=${editor}`);
          else window.location.assign(target);
        } });
    } catch (error) {
      if (!signal.aborted) setMessage(error instanceof Error ? error.message : "The editor could not open. Your work is still here.");
    } finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  }
  return <section className="rc-stack" aria-busy={busy}>
    <h3 className="rc-heading" data-size="section">Create your public project</h3>
    <fieldset className="rc-choice-group" disabled={busy}>
      <legend>Where would you like to manage it?</legend>
      <label className="rc-choice"><input className="rc-check" type="radio" name={editorName} checked={editor === "certified"}
        onChange={() => setEditor("certified")} /><span className="rc-choice-text"><span className="rc-choice-title">Certified</span>
        <span className="rc-choice-note">For any initiative, including art, software and research.</span></span></label>
      <label className="rc-choice"><input className="rc-check" type="radio" name={editorName} checked={editor === "maearth"}
        onChange={() => setEditor("maearth")} /><span className="rc-choice-text"><span className="rc-choice-title">Ma Earth</span>
        <span className="rc-choice-note">For nature and community initiatives that want to participate there.</span></span></label>
    </fieldset>
    <p>Your work stays here. The editor may ask you to sign in. Publish there, then use Back to return and find your project.</p>
    <details><summary className="rc-footer-link">Before you leave</summary>
      <p>Choose or create a shared organization or group, even if you start alone. You can reuse it for several projects.</p>
      <p>Weave sends none of your draft, files, needs or offers. A private draft in Ma Earth may not appear here until it is published. Creating a profile is separate from applying for funding.</p>
    </details>
    {pending && <p className="rc-meta">Reuse any organization or project you already started there.</p>}
    <div className="rc-action-bar">
      <button className="rc-button" data-variant="primary" type="button" disabled={busy || social.loading || !!social.problem}
        onClick={() => void leave()}>Continue to {PROJECT_EDITORS[editor].name}</button>
      <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={onCancel}>Keep working in Weave</button>
    </div>
    {message && <p className="rc-notice" data-tone="warning" role="status">{message}</p>}
  </section>;
}

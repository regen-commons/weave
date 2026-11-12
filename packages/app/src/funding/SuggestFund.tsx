import { useId, useState, type FormEvent } from "react";
import { StatusLine } from "../ui/StatusLine.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";

/**
 * A way to tell Regen Commons about a fund the catalog lacks. Example world only: the suggestion
 * stays in this page's memory, because no service receives suggestions yet. It asks for no contact
 * details, since a suggestion is checked against the funder's own page.
 */
export function SuggestFund() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState("");
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    setSent(typeof name === "string" ? name.trim() : "");
    setOpen(false);
  }
  return (
    <>
      <StatusLine
        actions={
          <button
            className="rc-button"
            data-variant="secondary"
            data-size="sm"
            type="button"
            onClick={() => setOpen(true)}
          >
            {sent ? "Suggest another" : "Suggest a fund"}
          </button>
        }
      >
        {sent
          ? `Thank you. Regen Commons checks ${sent} against the funder's page before it joins the list.`
          : "Know a fund that is not here?"}
      </StatusLine>
      <TaskDialog title="Suggest a fund" open={open} onClose={() => setOpen(false)}>
        <form className="rc-form" onSubmit={send}>
          <div className="rc-field">
            <label htmlFor={`${id}-name`}>Name of the fund or program</label>
            <input className="rc-input" id={`${id}-name`} name="name" required maxLength={120} data-task-focus />
          </div>
          <div className="rc-field">
            <label htmlFor={`${id}-link`}>Link to its page</label>
            <p className="rc-hint" id={`${id}-link-hint`}>
              The funder's own page, so the details can be checked.
            </p>
            <input
              className="rc-input"
              id={`${id}-link`}
              name="link"
              type="url"
              required
              maxLength={500}
              aria-describedby={`${id}-link-hint`}
            />
          </div>
          <div className="rc-field">
            <label htmlFor={`${id}-note`}>Anything we should know (optional)</label>
            <p className="rc-hint" id={`${id}-note-hint`}>
              Who it supports, a deadline, or how you heard of it.
            </p>
            <textarea
              className="rc-input"
              id={`${id}-note`}
              name="note"
              rows={3}
              maxLength={600}
              aria-describedby={`${id}-note-hint`}
            />
          </div>
          <button className="rc-button" data-variant="primary" type="submit">
            Send suggestion
          </button>
        </form>
      </TaskDialog>
    </>
  );
}

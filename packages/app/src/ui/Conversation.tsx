import type { Turn } from "../describe/contracts.ts";
/** Conversation molecule: the question and answer remain together when an answer is edited. */
export function Conversation({
  turns,
  question,
  edits,
  onDraftEdit,
  onCancel,
  onEdit,
}: {
  turns: readonly Turn[];
  question: string;
  edits: Record<string, string>;
  onDraftEdit(id: string, value: string): void;
  onCancel(id: string): void;
  onEdit(id: string, text: string): void;
}) {
  return (
    <ol className="rc-conversation">
      {turns.map((turn) => (
        <li className="rc-conversation-turn" key={turn.id}>
          <p className="rc-conversation-label">Assistant</p>
          <p className="rc-message" data-from="assistant">
            {turn.prompt}
          </p>
          <div className="rc-conversation-turn" data-from="person">
            <p className="rc-conversation-label">You{turn.via === "voice" ? ", spoken" : ""}</p>
            {edits[turn.id] !== undefined ? (
              <form
                className="rc-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onEdit(turn.id, edits[turn.id]!);
                }}
              >
                <div className="rc-field">
                  <label htmlFor={`edit-answer-${turn.id}`}>Your words</label>
                  <textarea
                    id={`edit-answer-${turn.id}`}
                    className="rc-input"
                    value={edits[turn.id]}
                    onChange={(event) => onDraftEdit(turn.id, event.target.value)}
                    maxLength={20000}
                    required
                    rows={4}
                  />
                </div>
                <div className="rc-action-bar">
                  <button className="rc-button" data-variant="secondary" type="submit">
                    Keep changes
                  </button>
                  <button
                    className="rc-button"
                    data-variant="quiet"
                    type="button"
                    onClick={() => onCancel(turn.id)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p className="rc-message" data-from="person">
                  {turn.text}
                </p>
                <button
                  className="rc-button"
                  data-variant="quiet"
                  type="button"
                  onClick={() => onDraftEdit(turn.id, turn.text)}
                >
                  Edit your words
                </button>
              </>
            )}
          </div>
        </li>
      ))}
      <li className="rc-conversation-turn">
        <p className="rc-conversation-label">Assistant</p>
        <p className="rc-message" data-from="assistant">
          {question}
        </p>
      </li>
    </ol>
  );
}

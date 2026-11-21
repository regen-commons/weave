/** How the last choice of initiative ended: opened, or refused with the reason. */
export interface ChoiceSettled {
  readonly id: string;
  readonly problem: unknown;
}

/**
 * Opens the initiatives a person picks one at a time, and lets the last pick win. Change Initiative
 * takes effect as it is chosen, and each arrow press in its menu is a choice, so a choice made while
 * another opens waits, and a later one takes its place. The page ends on the last initiative reached,
 * and two openings never run at once, so neither can write over the other (DL-112).
 *
 * `settled` hears once, when nothing is left to open: about the last choice, and a refusal of an
 * earlier choice that a later one replaced is not reported.
 */
export function lastChoiceWins(
  open: (id: string) => Promise<void>,
  settled: (result: ChoiceSettled) => void,
): (id: string) => void {
  let opening = false;
  let waiting: string | null = null;
  async function run(id: string): Promise<void> {
    opening = true;
    let problem: unknown = null;
    try {
      await open(id);
    } catch (error) {
      problem = error;
    }
    const next = waiting;
    waiting = null;
    if (next !== null) return run(next);
    opening = false;
    settled({ id, problem });
  }
  return (id) => {
    if (opening) waiting = id;
    else void run(id);
  };
}

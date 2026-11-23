/** The parts of a Worker this module uses, so a test can stand in for one. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: "message" | "error", listener: (event: Event) => void): void;
  removeEventListener(type: "message" | "error", listener: (event: Event) => void): void;
}

/** Why a reading did not come back: its worker would not start or would not take the message. */
export class WorkerProblem extends Error {
  readonly stage: "start" | "send";
  constructor(stage: "start" | "send") {
    super(stage === "start" ? "The worker could not start." : "The worker could not receive the message.");
    this.stage = stage;
  }
}

export interface ReusableWorker {
  /** Sends one message and resolves with the worker's reply to it. One message runs at a time. */
  run(message: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  /** Starts the worker ahead of the first reading, as when the person presses Talk It Out. */
  warm(): void;
  /** Ends the worker, as when the person leaves the page. The next reading starts a new one. */
  close(): void;
}

/**
 * One worker kept for a kind of reading, so every reading after the first skips starting it: a
 * worker and its module took 0.2 to 0.7 s to answer on a busy machine (speech's measurements, 22
 * November 2026). Messages go one at a time and each reply names the message it answers, so a
 * late reply is never taken for the next one. A reading that is stopped, or whose worker fails,
 * ends that worker, and the next reading starts a new one, so a stuck or broken worker is never
 * reused.
 */
export function reusableWorker(create: () => WorkerLike): ReusableWorker {
  let worker: WorkerLike | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let sent = 0;
  /** Ends the reading under way, when the worker is closed while it waits. */
  let interrupt: (() => void) | null = null;
  const retire = (target: WorkerLike) => {
    target.terminate();
    if (worker === target) worker = null;
  };
  const start = (): WorkerLike => {
    try {
      return (worker ??= create());
    } catch {
      throw new WorkerProblem("start");
    }
  };
  function send(message: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    const current = start();
    const id = ++sent;
    return new Promise((resolve, reject) => {
      const done = () => {
        interrupt = null;
        current.removeEventListener("message", reply);
        current.removeEventListener("error", failed);
        signal.removeEventListener("abort", stopped);
      };
      const reply = (event: Event) => {
        const data = (event as MessageEvent<unknown>).data as { id?: unknown } | null;
        if (data?.id !== id) return;
        done();
        resolve(data);
      };
      const failed = () => {
        done();
        retire(current);
        reject(new WorkerProblem("start"));
      };
      const stopped = () => {
        done();
        retire(current);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      current.addEventListener("message", reply);
      current.addEventListener("error", failed);
      signal.addEventListener("abort", stopped, { once: true });
      interrupt = stopped;
      try {
        current.postMessage({ ...message, id });
      } catch {
        done();
        retire(current);
        reject(new WorkerProblem("send"));
      }
    });
  }
  return {
    run(message, signal) {
      const turn = queue.then(() => send(message, signal));
      queue = turn.catch(() => undefined);
      return turn;
    },
    warm() {
      try {
        start();
      } catch {
        // A worker that cannot start says so when a reading asks for it.
      }
    },
    close() {
      interrupt?.();
      if (worker) retire(worker);
    },
  };
}

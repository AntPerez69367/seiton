import type { Logger } from '../adapters/logging.js';

export type CleanupFn = () => Promise<void>;

type SignalListener = (signal: NodeJS.Signals) => void;

const CLEANUP_TIMEOUT_MS = 5_000;

interface SignalState {
  handlers: CleanupFn[];
  registered: boolean;
  shuttingDown: boolean;
  sigtermListener: SignalListener | null;
  sigintListener: SignalListener | null;
}

const state: SignalState = {
  handlers: [],
  registered: false,
  shuttingDown: false,
  sigtermListener: null,
  sigintListener: null,
};

export function registerCleanup(fn: CleanupFn): () => void {
  state.handlers.push(fn);
  return () => {
    const idx = state.handlers.indexOf(fn);
    if (idx >= 0) state.handlers.splice(idx, 1);
  };
}

export function installSignalHandlers(logger?: Logger): void {
  if (state.registered) return;
  state.registered = true;

  const handler = (signal: string) => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    logger?.info('signal received, running cleanup', { signal });

    const exitCode = signal === 'SIGTERM' ? 143 : 130;
    const timeout = new Promise<'timeout'>((resolve) => {
      const t = setTimeout(() => resolve('timeout'), CLEANUP_TIMEOUT_MS);
      t.unref?.();
    });

    Promise.race([runCleanup(logger).then(() => 'done' as const), timeout])
      .then((outcome) => {
        if (outcome === 'timeout') {
          logger?.error('cleanup did not complete within timeout', {
            timeoutMs: CLEANUP_TIMEOUT_MS,
          });
        }
        process.exit(exitCode);
      })
      .catch((err: unknown) => {
        logger?.error('cleanup failed unexpectedly', {
          error: err instanceof Error ? err.message : String(err),
        });
        process.exit(exitCode);
      });
  };

  state.sigtermListener = () => handler('SIGTERM');
  state.sigintListener = () => handler('SIGINT');
  process.on('SIGTERM', state.sigtermListener);
  process.on('SIGINT', state.sigintListener);
}

async function runCleanup(logger?: Logger): Promise<void> {
  for (const fn of [...state.handlers].reverse()) {
    try {
      await fn();
    } catch (err: unknown) {
      logger?.error('cleanup handler failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function isShuttingDown(): boolean {
  return state.shuttingDown;
}

export function getRegisteredHandlerCount(): number {
  return state.handlers.length;
}

export function resetSignalState(): void {
  if (state.sigtermListener) {
    process.off('SIGTERM', state.sigtermListener);
    state.sigtermListener = null;
  }
  if (state.sigintListener) {
    process.off('SIGINT', state.sigintListener);
    state.sigintListener = null;
  }
  state.handlers = [];
  state.registered = false;
  state.shuttingDown = false;
}

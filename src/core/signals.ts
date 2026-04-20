import type { Logger } from '../adapters/logging.js';

export type CleanupFn = () => Promise<void>;

interface SignalState {
  handlers: CleanupFn[];
  registered: boolean;
  shuttingDown: boolean;
}

const state: SignalState = {
  handlers: [],
  registered: false,
  shuttingDown: false,
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

    runCleanup(logger).then(() => {
      const code = signal === 'SIGTERM' ? 143 : 130;
      process.exit(code);
    }).catch(() => {
      process.exit(1);
    });
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));
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

export function resetSignalState(): void {
  state.handlers = [];
  state.registered = false;
  state.shuttingDown = false;
}

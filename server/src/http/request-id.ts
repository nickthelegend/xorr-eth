/**
 * A request id on every request, echoed back and carried into every log line it produces.
 *
 * The logs were a flat stream of `[error] ...` with no way to tell which request a line belonged
 * to, or to connect a user's "it failed at about 3pm" to anything. Under any concurrency at all —
 * a scheduler tick overlapping two API calls — the interleaved lines are unreadable.
 *
 * Honoured from the caller when they send one, so an id can span a client retry and a proxy hop
 * rather than being reinvented at every boundary.
 */
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context, Next } from 'hono';

const store = new AsyncLocalStorage<{ id: string }>();

/** The id of the request being handled on this async path, if any. */
export function currentRequestId(): string | undefined {
  return store.getStore()?.id;
}

/**
 * Log with the current request's id attached.
 *
 * Deliberately a wrapper around `console` rather than a logging framework: the whole value here is
 * the correlation, and a dependency that has to be configured before it prints anything is a
 * dependency that gets configured wrong in the one deployment that matters.
 */
export const log = {
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
};

function emit(level: 'info' | 'warn' | 'error', args: unknown[]) {
  const id = currentRequestId();
  const prefix = id ? `[${id.slice(0, 8)}]` : '[-]';
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(prefix, ...args);
}

export async function requestId(c: Context, next: Next) {
  const incoming = c.req.header('x-request-id');
  // A client-supplied id is used, but bounded: it ends up in log lines, and an unbounded header is
  // an easy way to make those unreadable or to smuggle newlines into them.
  const id =
    incoming && /^[A-Za-z0-9_-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  c.header('x-request-id', id);
  c.set('requestId', id);
  return store.run({ id }, () => next());
}

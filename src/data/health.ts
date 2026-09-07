/**
 * Is the executor answering at all?
 *
 * Lives in the data layer because that is where network access lives — the repository-boundary
 * test enforces it, and the rule is a good one: a component that reaches the network directly is
 * a component nobody can test without a server. `Reachability` composes this into a heartbeat;
 * the request itself belongs here.
 *
 * `/health` and not a real route, so this reports on the NETWORK rather than the session. A
 * signed-out user is not offline, and telling them they are would be its own wrong answer.
 */
import { API_BASE } from './apiBase';

export async function executorReachable(): Promise<boolean> {
  return fetch(`${API_BASE}/health`, { method: 'GET' })
    .then((r) => r.ok)
    .catch(() => false);
}

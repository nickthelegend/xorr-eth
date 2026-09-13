/**
 * Which build this is, and whether the executor it talks to is the same one (FEATURES.md #53).
 *
 * The hosted app and its executors deploy separately — the web app to Vercel, each executor to Railway — so a screen
 * can be one commit ahead of the server it reads, and "fixed on main" can be true of one and not the other. The web
 * build carries its own commit (`scripts/build-web.mjs` writes `EXPO_PUBLIC_APP_COMMIT`); every executor reports its
 * commit as `/health` → `version`. Showing both, and whether they agree, is the difference between guessing and
 * knowing which code answered.
 */

/** The commit this bundle was built from. Undefined in a development build, which is whatever is on disk. */
const COMMIT = process.env.EXPO_PUBLIC_APP_COMMIT;
export const appCommit: string | undefined = COMMIT && /^[0-9a-f]{7,40}$/i.test(COMMIT) ? COMMIT.toLowerCase() : undefined;

/** Seven characters, as git prints a commit. */
export const shortCommit = (commit: string) => commit.slice(0, 7);

export type VersionAgreement =
  | { kind: 'same'; commit: string }
  | { kind: 'different'; app: string; executor: string }
  | { kind: 'unknown'; app?: string; executor?: string };

/** Whether this bundle and the executor were built from the same commit. Unknown when either did not say. */
export function compareVersions(app: string | undefined, executor: string | undefined): VersionAgreement {
  const a = app?.toLowerCase();
  const e = executor?.toLowerCase();
  if (!a || !e || !/^[0-9a-f]{7,40}$/.test(a) || !/^[0-9a-f]{7,40}$/.test(e)) return { kind: 'unknown', app: a, executor: e };
  // A short commit agrees with a full one it begins.
  return a.startsWith(e) || e.startsWith(a) ? { kind: 'same', commit: a.length >= e.length ? a : e } : { kind: 'different', app: a, executor: e };
}

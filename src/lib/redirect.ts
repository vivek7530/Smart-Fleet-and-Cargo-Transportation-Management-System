/**
 * `?next=` carries where someone was heading before they were asked to sign
 * in, and it arrives from the address bar, so it is attacker-controlled. Fed
 * straight to `router.replace` it is an open redirect: `/login?next=https://…`
 * would hand a freshly signed-in user to another site, at the exact moment
 * they are most likely to trust what it asks them for.
 *
 * So a redirect target has to look like a path on this site and nothing else.
 */

const DEFAULT_TARGET = '/dashboard';

/** Pages that would bounce the user straight back here. */
const LOOPS = ['/login', '/register'];

export function safeInternalPath(
  value: string | null | undefined,
  fallback = DEFAULT_TARGET,
): string {
  if (!value) return fallback;

  // One leading slash and no more: `//evil.com` and `/\evil.com` are both read
  // by browsers as another origin, not as a path here.
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;

  // Control characters can be used to smuggle a second header or confuse the
  // parser; a legitimate path never contains them.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  const path = value.split(/[?#]/)[0];
  if (LOOPS.includes(path)) return fallback;

  return value;
}

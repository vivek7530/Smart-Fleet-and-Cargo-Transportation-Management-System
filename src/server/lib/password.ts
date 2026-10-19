import bcrypt from 'bcryptjs';

/**
 * bcryptjs is pure JavaScript, so every extra round doubles sign-in time on the
 * event loop. 10 rounds (~4x faster than 12) is still within OWASP guidance for
 * bcrypt; older cost-12 hashes are upgraded transparently on the next sign-in.
 */
const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** True when a stored hash was made with a different cost than the current one. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) !== SALT_ROUNDS;
  } catch {
    return false;
  }
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Guards against weak passwords on the server, mirroring the client-side rules.
 * Returns null when the password is acceptable.
 */
export function describePasswordWeakness(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
}

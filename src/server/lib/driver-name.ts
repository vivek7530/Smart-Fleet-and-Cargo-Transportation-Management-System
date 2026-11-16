import { User } from '../models/User';
import { ApiError } from './ApiError';

/** Names are compared without case or repeated-whitespace differences. */
export function normaliseDriverName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

/** Includes invited and suspended drivers so the identity remains unique. */
export async function assertDriverNameAvailable(name: string, excludeUserId?: string): Promise<void> {
  // The name regex also catches drivers created before nameKey was introduced.
  // Escape each word and allow any whitespace between them for legacy records.
  const legacyNamePattern = `^\\s*${name.trim().split(/\s+/).map(escapeRegExp).join('\\s+')}\\s*$`;
  const filter = {
    role: 'DRIVER',
    $or: [
      { nameKey: normaliseDriverName(name) },
      { name: { $regex: legacyNamePattern, $options: 'i' } },
    ],
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
  };
  if (await User.exists(filter)) {
    throw ApiError.conflict('A driver with this name already exists. Choose a different name.');
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

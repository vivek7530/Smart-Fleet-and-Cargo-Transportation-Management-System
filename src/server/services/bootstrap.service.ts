import { env } from '../config/env';
import { User } from '../models/User';
import { hashPassword } from '../lib/password';
import { logger } from '../lib/logger';
import { recordAudit } from './audit.service';

/**
 * Creates the initial administrator on first boot when no ADMIN exists.
 * The password is taken from the environment and stored as a bcrypt hash.
 */
export async function ensureInitialAdmin(): Promise<void> {
  const existingAdmin = await User.findOne({ role: 'ADMIN' }).select('_id').lean();
  if (existingAdmin) return;

  const admin = await User.create({
    name: env.admin.name,
    email: env.admin.email,
    passwordHash: await hashPassword(env.admin.password),
    role: 'ADMIN',
    status: 'ACTIVE',
    invitationStatus: 'NONE',
    lockedContactField: 'email',
    designation: 'Administrator',
    avatarColor: 'violet',
  });

  await recordAudit({
    actor: { id: admin._id, name: admin.name, role: 'ADMIN' },
    action: 'ADMIN_BOOTSTRAPPED',
    summary: `Initial administrator account created for ${admin.email}`,
    entity: 'User',
    entityId: admin._id,
  });

  logger.success(`Initial admin created â†’ ${env.admin.email}`);
  if (env.admin.password === 'ChangeMe123!') {
    logger.warn('The default admin password is still in use. Change ADMIN_PASSWORD before deploying.');
  }
}


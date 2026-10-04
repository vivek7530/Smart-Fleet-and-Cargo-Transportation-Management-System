import type { AnonCtx, Ctx } from '../../api/context';
import { User, type UserDocument } from '../../models/User';
import { ApiError } from '../../lib/ApiError';
import { hashPassword, verifyPassword } from '../../lib/password';
import { isValidMobile, normaliseEmail, normaliseMobile } from '../../lib/contact';
import { recordAudit } from '../../services/audit.service';
import { notify, usersWithRoles } from '../../services/notification.service';
import { resolveInvitation } from '../../services/invitation.service';
import type { LoginInput, RegisterInput, UpdateProfileInput } from './auth.validation';

/** Shape returned to the client — deliberately free of any secret material. */
export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  role: string;
  status: string;
  designation?: string;
  avatarColor?: string;
  lockedContactField: 'email' | 'mobile' | null;
  licenseNumber?: string;
  licenseExpiry?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
}

export function toSessionUser(user: UserDocument): SessionUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email ?? null,
    mobile: user.mobile ?? null,
    role: user.role,
    status: user.status,
    designation: user.designation,
    avatarColor: user.avatarColor,
    lockedContactField: user.lockedContactField ?? null,
    licenseNumber: user.licenseNumber,
    licenseExpiry: user.licenseExpiry ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  };
}

export async function authenticate(input: LoginInput): Promise<UserDocument> {
  const identifier = input.identifier.trim();
  const query = identifier.includes('@')
    ? { email: normaliseEmail(identifier) }
    : { mobile: normaliseMobile(identifier) };

  const user = await User.findOne(query).select('+passwordHash');

  // The same generic message is returned for an unknown account and a wrong
  // password so the endpoint cannot be used to enumerate users.
  const invalid = ApiError.unauthenticated('Incorrect email/mobile or password', 'INVALID_CREDENTIALS');
  if (!user || !user.passwordHash) throw invalid;

  const matches = await verifyPassword(input.password, user.passwordHash);
  if (!matches) throw invalid;

  if (user.status === 'SUSPENDED') {
    throw ApiError.forbidden('Your account has been suspended. Please contact your administrator.');
  }
  if (user.status === 'INVITED') {
    throw ApiError.forbidden('Your account is not activated yet. Please complete your registration first.');
  }

  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

/**
 * Completes an invitation.
 *
 * The contact channel used for the invitation is authoritative: whatever the
 * client sends for that field is discarded. The *other* channel may be filled in.
 */
// There is no signed-in user during registration, so only the request metadata
// is available for the audit entry.
export async function registerFromInvitation(input: RegisterInput, ctx: AnonCtx): Promise<UserDocument> {
  const invitation = await resolveInvitation(input.token);

  const user = invitation.user ? await User.findById(invitation.user).select('+passwordHash') : null;
  if (!user) {
    throw ApiError.notFound('The account for this invitation no longer exists. Please ask for a new invitation.');
  }
  if (user.status === 'ACTIVE') {
    throw ApiError.conflict('This account has already been activated. Please sign in instead.');
  }

  const lockedField = invitation.channel === 'EMAIL' ? 'email' : 'mobile';

  if (lockedField === 'email') {
    // Email came from the invitation and stays exactly as it was issued.
    user.email = invitation.email ?? user.email;
    if (input.mobile) {
      if (!isValidMobile(input.mobile)) throw ApiError.validation('Please enter a valid mobile number');
      await assertContactAvailable('mobile', input.mobile, String(user._id));
      user.mobile = input.mobile;
    }
  } else {
    user.mobile = invitation.mobile ?? user.mobile;
    if (input.email) {
      await assertContactAvailable('email', input.email, String(user._id));
      user.email = input.email;
    }
  }

  user.name = input.name;
  user.passwordHash = await hashPassword(input.password);
  user.status = 'ACTIVE';
  user.invitationStatus = 'ACCEPTED';
  user.lockedContactField = lockedField;
  user.lastLoginAt = new Date();

  if (input.designation) user.designation = input.designation;
  if (input.address) user.address = input.address;
  if (input.emergencyContactName) user.emergencyContactName = input.emergencyContactName;
  if (input.emergencyContactPhone) user.emergencyContactPhone = input.emergencyContactPhone;
  if (user.role === 'DRIVER') {
    if (input.licenseNumber) user.licenseNumber = input.licenseNumber;
    if (input.licenseExpiry) user.licenseExpiry = new Date(input.licenseExpiry);
  }

  await user.save();

  invitation.status = 'ACCEPTED';
  invitation.acceptedAt = new Date();
  await invitation.save();

  await recordAudit({
    ctx,
    actor: { id: user._id, name: user.name, role: user.role },
    action: 'USER_REGISTERED',
    summary: `${user.name} completed registration as ${titleCase(user.role)}`,
    entity: 'User',
    entityId: user._id,
    metadata: { invitationId: String(invitation._id), channel: invitation.channel },
  });

  await notify({
    users: [invitation.invitedBy, ...(await usersWithRoles('ADMIN'))],
    type: 'INVITATION_ACCEPTED',
    title: 'Invitation accepted',
    message: `${user.name} completed registration as ${titleCase(user.role)}.`,
    link: `/users/${user._id}`,
    entity: 'User',
    entityId: user._id,
  });

  return user;
}

export async function changePassword(
  user: UserDocument,
  currentPassword: string,
  newPassword: string,
  ctx: Ctx,
): Promise<void> {
  const withHash = await User.findById(user._id).select('+passwordHash');
  if (!withHash?.passwordHash) throw ApiError.badRequest('This account has no password set');

  const matches = await verifyPassword(currentPassword, withHash.passwordHash);
  if (!matches) throw ApiError.badRequest('Your current password is incorrect');

  withHash.passwordHash = await hashPassword(newPassword);
  await withHash.save();

  await recordAudit({
    ctx,
    action: 'PASSWORD_CHANGED',
    summary: `${user.name} changed their password`,
    entity: 'User',
    entityId: user._id,
  });
}

/**
 * Self-service profile update. The locked contact channel is skipped even if the
 * client sends it — the same rule that applies during registration.
 */
export async function updateOwnProfile(
  user: UserDocument,
  input: UpdateProfileInput,
  ctx: Ctx,
): Promise<UserDocument> {
  if (input.name) user.name = input.name;
  if (input.designation !== undefined) user.designation = input.designation;
  if (input.address !== undefined) user.address = input.address;
  if (input.dateOfBirth) user.dateOfBirth = new Date(input.dateOfBirth);
  if (input.emergencyContactName !== undefined) user.emergencyContactName = input.emergencyContactName;
  if (input.emergencyContactPhone !== undefined) user.emergencyContactPhone = input.emergencyContactPhone;
  if (input.avatarColor) user.avatarColor = input.avatarColor;

  if (user.role === 'DRIVER') {
    if (input.licenseNumber !== undefined) user.licenseNumber = input.licenseNumber;
    if (input.licenseExpiry) user.licenseExpiry = new Date(input.licenseExpiry);
    if (input.experienceYears !== undefined) user.experienceYears = input.experienceYears;
  }

  if (input.email && user.lockedContactField !== 'email') {
    await assertContactAvailable('email', input.email, String(user._id));
    user.email = input.email;
  }
  if (input.mobile && user.lockedContactField !== 'mobile') {
    await assertContactAvailable('mobile', input.mobile, String(user._id));
    user.mobile = input.mobile;
  }

  await user.save();

  await recordAudit({
    ctx,
    action: 'PROFILE_UPDATED',
    summary: `${user.name} updated their profile`,
    entity: 'User',
    entityId: user._id,
  });

  return user;
}

/** Rejects a contact value that already belongs to a different account. */
export async function assertContactAvailable(
  field: 'email' | 'mobile',
  value: string,
  excludeUserId?: string,
): Promise<void> {
  const existing = await User.findOne({ [field]: value }).select('_id').lean();
  if (existing && String(existing._id) !== excludeUserId) {
    throw ApiError.conflict(
      field === 'email'
        ? 'That email address is already registered to another account'
        : 'That mobile number is already registered to another account',
      'DUPLICATE_KEY',
    );
  }
}

export function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}



import type { Ctx } from '../../api/context';
import type { FilterQuery } from 'mongoose';
import { Invitation } from '../../models/Invitation';
import { Trip } from '../../models/Trip';
import { Truck } from '../../models/Truck';
import { User, type UserDocument } from '../../models/User';
import { AuditLog } from '../../models/AuditLog';
import { ApiError } from '../../lib/ApiError';
import {
  dateRangeFilter,
  mergeFilters,
  paginate,
  resolveSort,
  searchFilter,
  type ListQuery,
} from '../../lib/pagination';
import { recordAudit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { assertContactAvailable, titleCase } from '../auth/auth.service';
import {
  buildInvitationLink,
  deliverInvitation,
  generateInvitationToken,
  invitationExpiry,
} from '../../services/invitation.service';
import type { InviteUserInput, UpdateUserInput } from './users.validation';

const USER_SEARCH_FIELDS = ['name', 'email', 'mobile', 'designation', 'licenseNumber'];
const USER_SORT_FIELDS = ['createdAt', 'name', 'role', 'status', 'lastLoginAt'];

/**
 * Invites a Manager or Driver.
 *
 * A placeholder user is created straight away so administrators can see pending
 * people in the users list; the invitation row holds the single-use token.
 */
export async function inviteUser(input: InviteUserInput, ctx: Ctx) {
  const inviter = ctx.user;

  // Prefer the explicit channel, otherwise fall back to whichever contact was given.
  const channel = input.channel ?? (input.email ? 'EMAIL' : 'MOBILE');
  const lockedContactField = channel === 'EMAIL' ? 'email' : 'mobile';
  const destination = channel === 'EMAIL' ? input.email! : input.mobile!;

  if (input.email) await assertContactAvailable('email', input.email);
  if (input.mobile) await assertContactAvailable('mobile', input.mobile);

  const user = await User.create({
    name: input.name,
    email: input.email,
    mobile: input.mobile,
    role: input.role,
    status: 'INVITED',
    invitationStatus: 'PENDING',
    invitedBy: inviter._id,
    lockedContactField,
    avatarColor: pickAvatarColor(input.name),
  });

  const { token, tokenHash, preview } = generateInvitationToken();

  const invitation = await Invitation.create({
    name: input.name,
    email: input.email ?? null,
    mobile: input.mobile ?? null,
    role: input.role,
    channel,
    tokenHash,
    tokenPreview: preview,
    invitedBy: inviter._id,
    user: user._id,
    status: 'PENDING',
    expiresAt: invitationExpiry(),
  });

  const link = buildInvitationLink(token);
  const delivery = await deliverInvitation({
    channel,
    to: destination,
    name: input.name,
    role: input.role,
    link,
  });

  await recordAudit({
    ctx,
    action: 'USER_INVITED',
    summary: `${inviter.name} invited ${input.name} as ${titleCase(input.role)} via ${channel.toLowerCase()}`,
    entity: 'Invitation',
    entityId: invitation._id,
    metadata: { role: input.role, channel, destination },
  });

  return {
    invitation: invitation.toJSON(),
    user: user.toJSON(),
    delivery,
    /**
     * No SMS/email provider is configured in this build, so the link is handed
     * back to the inviting admin to share manually.
     */
    invitationLink: link,
  };
}

export async function listUsers(query: ListQuery & { role?: string; status?: string; invitationStatus?: string }) {
  const { sortBy, sortDir } = resolveSort(query, USER_SORT_FIELDS);

  const filter = mergeFilters<UserDocument>(
    query.role ? ({ role: query.role } as FilterQuery<UserDocument>) : null,
    query.status ? ({ status: query.status } as FilterQuery<UserDocument>) : null,
    query.invitationStatus ? ({ invitationStatus: query.invitationStatus } as FilterQuery<UserDocument>) : null,
    searchFilter(query.search, USER_SEARCH_FIELDS) as FilterQuery<UserDocument> | null,
    dateRangeFilter('createdAt', query.from, query.to) as FilterQuery<UserDocument> | null,
  );

  return paginate(User, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: { path: 'invitedBy', select: 'name role' },
  });
}

/** Managers may only browse drivers; admins see everyone. */
export function scopeUserListForRole(
  role: string,
  query: ListQuery & { role?: string },
): ListQuery & { role?: string } {
  if (role === 'ADMIN') return query;
  return { ...query, role: 'DRIVER' };
}

export async function getUserById(id: string, viewerRole: string) {
  const user = await User.findById(id).populate('invitedBy', 'name role');
  if (!user) throw ApiError.notFound('That user could not be found');
  if (viewerRole === 'MANAGER' && user.role === 'ADMIN') {
    throw ApiError.forbidden('You do not have permission to view this user');
  }
  return user;
}

/** Aggregated stats shown on a driver / manager detail page. */
export async function getUserStats(user: UserDocument) {
  if (user.role !== 'DRIVER') {
    const [tripsCreated, trucksAdded] = await Promise.all([
      Trip.countDocuments({ createdBy: user._id }),
      Truck.countDocuments({ createdBy: user._id }),
    ]);
    return { tripsCreated, trucksAdded };
  }

  const [assignedTruck, tripAgg] = await Promise.all([
    Truck.findOne({ assignedDriver: user._id }).select('truckNumber registrationNumber make model status'),
    Trip.aggregate<{ _id: string; count: number; revenue: number }>([
      { $match: { driver: user._id } },
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$revenue' } } },
    ]),
  ]);

  const byStatus = Object.fromEntries(tripAgg.map((row) => [row._id, row.count]));
  const totalTrips = tripAgg.reduce((sum, row) => sum + row.count, 0);

  return {
    assignedTruck,
    totalTrips,
    activeTrips: (byStatus.ASSIGNED ?? 0) + (byStatus.LOADING ?? 0) + (byStatus.IN_TRANSIT ?? 0),
    completedTrips: byStatus.COMPLETED ?? 0,
    revenueGenerated: tripAgg.reduce((sum, row) => sum + row.revenue, 0),
  };
}

export async function updateUser(id: string, input: UpdateUserInput, ctx: Ctx) {
  const actor = ctx.user;
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('That user could not be found');

  if (String(user._id) === String(actor._id) && input.status && input.status !== user.status) {
    throw ApiError.badRequest('You cannot change your own account status');
  }
  if (String(user._id) === String(actor._id) && input.role && input.role !== user.role) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (user.role === 'ADMIN' && input.role && input.role !== 'ADMIN') {
    await assertNotLastAdmin(String(user._id));
  }

  // The channel that delivered the invitation stays immutable for the lifetime
  // of the account, exactly as it is during registration.
  if (input.email && user.lockedContactField === 'email' && input.email !== user.email) {
    throw ApiError.badRequest('The email address used for the invitation cannot be changed');
  }
  if (input.mobile && user.lockedContactField === 'mobile' && input.mobile !== user.mobile) {
    throw ApiError.badRequest('The mobile number used for the invitation cannot be changed');
  }

  if (input.email && input.email !== user.email) {
    await assertContactAvailable('email', input.email, String(user._id));
    user.email = input.email;
  }
  if (input.mobile && input.mobile !== user.mobile) {
    await assertContactAvailable('mobile', input.mobile, String(user._id));
    user.mobile = input.mobile;
  }

  const changes: string[] = [];
  const assign = <K extends keyof UserDocument>(key: K, value: UserDocument[K] | undefined) => {
    if (value === undefined) return;
    if (user[key] !== value) changes.push(String(key));
    user[key] = value;
  };

  assign('name', input.name as UserDocument['name']);
  assign('role', input.role as UserDocument['role']);
  assign('status', input.status as UserDocument['status']);
  assign('designation', input.designation as UserDocument['designation']);
  assign('address', input.address as UserDocument['address']);
  assign('licenseNumber', input.licenseNumber as UserDocument['licenseNumber']);
  assign('experienceYears', input.experienceYears as UserDocument['experienceYears']);
  assign('emergencyContactName', input.emergencyContactName as UserDocument['emergencyContactName']);
  assign('emergencyContactPhone', input.emergencyContactPhone as UserDocument['emergencyContactPhone']);
  if (input.licenseExpiry !== undefined) {
    user.licenseExpiry = input.licenseExpiry ? new Date(input.licenseExpiry) : null;
  }

  await user.save();

  await recordAudit({
    ctx,
    action: 'USER_UPDATED',
    summary: `${actor.name} updated ${user.name}'s account`,
    entity: 'User',
    entityId: user._id,
    metadata: { changes },
  });

  if (input.status === 'SUSPENDED') {
    await notify({
      users: [user._id],
      type: 'GENERAL',
      title: 'Account suspended',
      message: 'Your account has been suspended. Please contact your administrator.',
    });
  }

  return user;
}

export async function deleteUser(id: string, ctx: Ctx) {
  const actor = ctx.user;
  if (String(actor._id) === id) throw ApiError.badRequest('You cannot delete your own account');

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('That user could not be found');
  if (user.role === 'ADMIN') await assertNotLastAdmin(id);

  // Refuse to orphan live operational data.
  const [activeTrips, assignedTrucks] = await Promise.all([
    Trip.countDocuments({ driver: user._id, status: { $in: ['ASSIGNED', 'LOADING', 'IN_TRANSIT'] } }),
    Truck.countDocuments({ assignedDriver: user._id }),
  ]);

  if (activeTrips > 0) {
    throw ApiError.conflict(
      `${user.name} is on ${activeTrips} active trip${activeTrips > 1 ? 's' : ''}. Complete or reassign them first.`,
    );
  }
  if (assignedTrucks > 0) {
    throw ApiError.conflict(
      `${user.name} is still assigned to ${assignedTrucks} truck${assignedTrucks > 1 ? 's' : ''}. Unassign them first.`,
    );
  }

  await Promise.all([
    User.deleteOne({ _id: user._id }),
    Invitation.updateMany({ user: user._id, status: 'PENDING' }, { status: 'REVOKED', revokedAt: new Date() }),
  ]);

  await recordAudit({
    ctx,
    action: 'USER_DELETED',
    summary: `${actor.name} deleted the account for ${user.name}`,
    entity: 'User',
    entityId: user._id,
    metadata: { role: user.role, email: user.email, mobile: user.mobile },
  });

  return { id };
}

async function assertNotLastAdmin(userId: string) {
  const otherAdmins = await User.countDocuments({
    role: 'ADMIN',
    status: 'ACTIVE',
    _id: { $ne: userId },
  });
  if (otherAdmins === 0) {
    throw ApiError.conflict('At least one active administrator must remain');
  }
}

export async function listInvitations(query: ListQuery & { status?: string; role?: string }) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt', 'expiresAt', 'status', 'name']);

  const filter = mergeFilters(
    query.status ? { status: query.status } : null,
    query.role ? { role: query.role } : null,
    searchFilter(query.search, ['name', 'email', 'mobile']),
  );

  return paginate(Invitation, {
    filter,
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
    populate: { path: 'invitedBy', select: 'name role' },
  });
}

/** Issues a fresh token for a still-pending invitation and invalidates the old one. */
export async function resendInvitation(id: string, ctx: Ctx) {
  const actor = ctx.user;
  const invitation = await Invitation.findById(id);
  if (!invitation) throw ApiError.notFound('That invitation could not be found');
  if (invitation.status === 'ACCEPTED') throw ApiError.conflict('That invitation has already been accepted');
  if (invitation.status === 'REVOKED') throw ApiError.conflict('That invitation was revoked');

  const { token, tokenHash, preview } = generateInvitationToken();
  invitation.tokenHash = tokenHash;
  invitation.tokenPreview = preview;
  invitation.expiresAt = invitationExpiry();
  invitation.status = 'PENDING';
  invitation.resendCount += 1;
  invitation.lastSentAt = new Date();
  await invitation.save();

  const destination = invitation.channel === 'EMAIL' ? invitation.email! : invitation.mobile!;
  const link = buildInvitationLink(token);
  const delivery = await deliverInvitation({
    channel: invitation.channel,
    to: destination,
    name: invitation.name,
    role: invitation.role,
    link,
  });

  await recordAudit({
    ctx,
    action: 'INVITATION_RESENT',
    summary: `${actor.name} resent the invitation for ${invitation.name}`,
    entity: 'Invitation',
    entityId: invitation._id,
  });

  return { invitation: invitation.toJSON(), invitationLink: link, delivery };
}

export async function revokeInvitation(id: string, ctx: Ctx) {
  const actor = ctx.user;
  const invitation = await Invitation.findById(id);
  if (!invitation) throw ApiError.notFound('That invitation could not be found');
  if (invitation.status === 'ACCEPTED') throw ApiError.conflict('That invitation has already been accepted');

  invitation.status = 'REVOKED';
  invitation.revokedAt = new Date();
  await invitation.save();

  if (invitation.user) {
    await User.updateOne(
      { _id: invitation.user, status: 'INVITED' },
      { invitationStatus: 'REVOKED', status: 'SUSPENDED' },
    );
  }

  await recordAudit({
    ctx,
    action: 'INVITATION_REVOKED',
    summary: `${actor.name} revoked the invitation for ${invitation.name}`,
    entity: 'Invitation',
    entityId: invitation._id,
  });

  return invitation.toJSON();
}

/** Recent audit trail for one user — powers the "manager/driver activity" views. */
export async function getUserActivity(userId: string, query: ListQuery) {
  const { sortBy, sortDir } = resolveSort(query, ['createdAt']);
  return paginate(AuditLog, {
    filter: { user: userId },
    limit: query.limit,
    cursor: query.cursor,
    sortBy,
    sortDir,
  });
}

const AVATAR_COLORS = ['violet', 'blue', 'emerald', 'amber', 'rose', 'cyan', 'indigo', 'teal'];

function pickAvatarColor(seed: string): string {
  const total = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[total % AVATAR_COLORS.length];
}



import { z } from 'zod';
import { ROLES, USER_STATUSES } from '../../types/enums';
import { optionalEmailField, optionalMobileField } from '../../lib/contact';
import { listQuerySchema } from '../../lib/pagination';

export const inviteUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    email: optionalEmailField,
    mobile: optionalMobileField,
    role: z.enum(['MANAGER', 'DRIVER'], {
      errorMap: () => ({ message: 'Choose either Manager or Driver' }),
    }),
    /** Which channel to deliver through when both contacts are supplied. */
    channel: z.enum(['EMAIL', 'MOBILE']).optional(),
  })
  // At least one contact method is required — neither one alone is mandatory.
  .refine((data) => Boolean(data.email || data.mobile), {
    message: 'Provide an email address or a mobile number',
    path: ['email'],
  })
  .refine((data) => !(data.channel === 'EMAIL' && !data.email), {
    message: 'An email address is required to invite by email',
    path: ['email'],
  })
  .refine((data) => !(data.channel === 'MOBILE' && !data.mobile), {
    message: 'A mobile number is required to invite by mobile',
    path: ['mobile'],
  });

export const listUsersQuerySchema = listQuerySchema.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  invitationStatus: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'NONE']).optional(),
});

export const listInvitationsQuerySchema = listQuerySchema.extend({
  status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']).optional(),
  role: z.enum(['MANAGER', 'DRIVER']).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: optionalEmailField,
  mobile: optionalMobileField,
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  designation: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  licenseNumber: z.string().trim().max(60).optional(),
  licenseExpiry: z.string().datetime().or(z.string().date()).nullable().optional(),
  experienceYears: z.coerce.number().min(0).max(60).optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().trim().max(30).optional(),
});

export const objectIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'That identifier is not valid'),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;


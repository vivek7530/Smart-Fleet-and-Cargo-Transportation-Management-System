import { z } from 'zod';
import {
  emailField,
  mobileField,
  optionalEmailField,
  optionalMobileField,
  passwordField,
} from '../../lib/contact';

export const loginSchema = z.object({
  /** Accepts either an email address or a mobile number. */
  identifier: z.string().trim().min(1, 'Email or mobile number is required'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    token: z.string().trim().min(10, 'The invitation token is missing or malformed'),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    password: passwordField,
    confirmPassword: z.string(),
    // Only the contact channel that was NOT used for the invitation may be supplied here.
    email: optionalEmailField,
    mobile: optionalMobileField,
    designation: z.string().trim().max(120).optional(),
    address: z.string().trim().max(500).optional(),
    licenseNumber: z.string().trim().max(60).optional(),
    licenseExpiry: z.string().datetime().or(z.string().date()).optional(),
    emergencyContactName: z.string().trim().max(120).optional(),
    emergencyContactPhone: z.string().trim().max(30).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const invitationTokenParamSchema = z.object({
  token: z.string().trim().min(10),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Your current password is required'),
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120).optional(),
  email: optionalEmailField,
  mobile: optionalMobileField,
  designation: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  dateOfBirth: z.string().datetime().or(z.string().date()).optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().trim().max(30).optional(),
  licenseNumber: z.string().trim().max(60).optional(),
  licenseExpiry: z.string().datetime().or(z.string().date()).optional(),
  experienceYears: z.coerce.number().min(0).max(60).optional(),
  avatarColor: z.string().trim().max(20).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export { emailField, mobileField };


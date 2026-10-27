import { z } from 'zod';
import { PASSWORD_POLICY } from '@/lib/validations/password-policy';

const passwordRules = z
  .string()
  .min(PASSWORD_POLICY.minLength, `Password must be at least ${PASSWORD_POLICY.minLength} characters`)
  .max(PASSWORD_POLICY.maxLength, `Password must not exceed ${PASSWORD_POLICY.maxLength} characters`)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20, 'Reset token is missing or invalid'),
    newPassword: passwordRules,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordRules,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

export const activateAccountSchema = z
  .object({
    token: z.string().min(20, 'Activation token is missing or invalid'),
    username: z
      .string()
      .trim()
      .min(4, 'Username must be at least 4 characters')
      .max(100)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Username may contain letters, numbers, dot, underscore and hyphen only'),
    password: passwordRules,
    confirmPassword: z.string(),
    mobile: z
      .string()
      .trim()
      .regex(/^(\+?\d{10,15})$/, 'Enter a valid mobile number')
      .optional()
      .or(z.literal('')),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Zod schemas for user management, defined once and imported by both the
 * client form and the server handler (§14).
 */

import { z } from 'zod';

export const USER_ROLES = ['super_admin', 'admin'] as const;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Enter the person’s name.').max(120),
  email: z.email('Enter a valid email address.').trim().toLowerCase(),
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
  role: z.enum(USER_ROLES, { message: 'Pick a role.' }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

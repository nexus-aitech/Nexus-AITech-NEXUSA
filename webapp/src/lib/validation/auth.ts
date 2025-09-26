// ==============================================
// File: src/lib/validation/auth.ts
// Zod schemas for authentication & signup flows
// - Strong type-safety
// - Custom error messages
// - Production-ready validation
// ==============================================

import { z } from "zod"

// ---------- Common Validators ----------
const emailSchema = z
  .string()
  .min(1, { message: "Email is required." })
  .email({ message: "Please enter a valid email address." })

const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters long." })
  .max(64, { message: "Password must be less than 64 characters." })

// ---------- Schemas ----------
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(8, { message: "Confirm your password." }),
  agree: z
    .boolean()
    .refine((val) => val === true, {
      message: "You must agree to the terms and conditions.",
    }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
})

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const resetPasswordSchema = z.object({
  email: emailSchema,
})

export const changePasswordSchema = z
  .object({
    oldPassword: passwordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string().min(8, { message: "Confirm your password." }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

// ---------- Types ----------
export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

// webapp/lib/validation/auth.ts
import { z } from "zod";

/* ------------------------------ Utils ------------------------------ */
const normalize = (v: string) =>
  v
    .replace(/\u200c/g, " ")      // ZWNJ -> space
    .replace(/\s+/g, " ")         // collapse spaces
    .trim();

const hasWeakSequence = (s: string) => {
  const sequences = ["1234", "abcd", "qwer", "asdf", "zxcv"];
  const t = s.toLowerCase();
  return sequences.some(seq => t.includes(seq) || t.split("").reverse().join("").includes(seq));
};

/* -------------------------------- Name ----------------------------- */
// فقط حروف (هر زبان)، فاصله و «-»
const NAME_RE = /^[\p{L}\p{M}\s\-]+$/u;
export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "نام خیلی کوتاه است")
  .max(80, "نام خیلی بلند است")
  .refine((v) => NAME_RE.test(v), "فقط حروف، فاصله و «-» مجاز است")
  .transform((v) => normalize(v));

/* ------------------------------- Email ----------------------------- */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("ایمیل نامعتبر");

/* ----------------------------- Password ---------------------------- */
export const passwordSchema = z
  .string()
  .min(8, "حداقل ۸ کاراکتر")
  .regex(/[A-Z]/, "حداقل یک حرف بزرگ")
  .regex(/[a-z]/, "حداقل یک حرف کوچک")
  .regex(/[0-9]/, "حداقل یک عدد")
  .regex(/[^A-Za-z0-9]/, "حداقل یک کاراکتر خاص")
  .refine((v) => !hasWeakSequence(v), "رمز شامل توالی ساده است");

/* ------------------------------ Signup ----------------------------- */
export const signupSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  agree: z.literal(true, {
    errorMap: () => ({ message: "باید شرایط استفاده را بپذیرید" }),
  }),
});

export type SignupInput = z.infer<typeof signupSchema>;

// webapp/lib/validation/auth.ts
import { z } from "zod";

/* -------------------------- Helpers: normalizers -------------------------- */
const collapseSpaces = (s: string) => s.replace(/\s+/g, " ");
const stripControls = (s: string) => s.replace(/[\u0000-\u001F\u007F]/g, "");
const normalize = (s: string) => collapseSpaces(stripControls(s.trim()));

/* ------------------------------- Email ----------------------------------- */
export const emailSchema = z
  .string()
  .transform((v) => normalize(v).toLowerCase())
  .min(6, "ایمیل بسیار کوتاه است")
  .max(254, "ایمیل بسیار بلند است")
  .email("ایمیل معتبر نیست");

/* ------------------------------ Password --------------------------------- */
// لیست کوتاهِ رمزهای بسیار رایج. (برای نسخهٔ کامل می‌توان از سرویس HIBP در سرور استفاده کرد)
const commonBad = new Set([
  "123456","1234567","12345678","123456789","1234567890",
  "qwerty","password","111111","000000","iloveyou","abc123"
]);

// تشخیص توالی ساده (abcde یا 12345 یا qwerty وار)
const looksSequential = (pw: string) => {
  const s = pw.toLowerCase();
  const sequences = ["abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm", "0123456789"];
  return sequences.some(seq => seq.includes(s) || seq.split("").reverse().join("").includes(s));
};

export const passwordSchema = z
  .string()
  .transform((v) => normalize(v))
  .min(8, "حداقل ۸ کاراکتر")
  .max(128, "حداکثر ۱۲۸ کاراکتر")
  .regex(/[A-Z]/, "حداقل یک حرف بزرگ")
  .regex(/[a-z]/, "حداقل یک حرف کوچک")
  .regex(/[0-9]/, "حداقل یک رقم")
  .regex(/[^A-Za-z0-9]/, "حداقل یک کاراکتر ویژه")
  .superRefine((pw, ctx) => {
    const plain = pw.toLowerCase();
    if (commonBad.has(plain)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "رمز عبور بسیار رایج است" });
    }
    if (looksSequential(plain)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "از الگوهای متوالی یا ساده استفاده نکنید" });
    }
  });

/* -------------------------------- Name ----------------------------------- */
// اجازهٔ حروف فارسی/عربی و لاتین + فاصله و «-»
const NAME_RE = /^[\p{L}\p{M}\s\-]+$/u;
export const fullNameSchema = z
  .string()
  .transform((v) => normalize(v))
  .min(2, "نام خیلی کوتاه است")
  .max(80, "نام خیلی بلند است")
  .refine((v) => NAME_RE.test(v), "فقط حروف، فاصله و «-» مجاز است");

/* ------------------------------ Signup ----------------------------------- */
export const signupSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  agree: z.literal(true, { errorMap: () => ({ message: "پذیرش شرایط الزامی است" }) }),
  // اختیاری: برای Anti-bot (مثلاً Turnstile/Recaptcha)
  captchaToken: z.string().min(1).optional(),
  // اختیاری: کد معرف
  referral: z.string().trim().max(64).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

/* ------------------------------- Login ----------------------------------- */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "رمز عبور را وارد کنید"),
});
export type LoginInput = z.infer<typeof loginSchema>;

/* ---------------------------- Forgot / Reset ----------------------------- */
export const requestResetSchema = z.object({
  email: emailSchema,
});
export type RequestResetInput = z.infer<typeof requestResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(24, "توکن نامعتبر است"),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/* ---------------------------- Email Verify ------------------------------- */
export const verifyEmailSchema = z.object({
  token: z.string().min(24, "توکن نامعتبر است"),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/* --------------------------- Contact / Feedback -------------------------- */
export const contactSchema = z.object({
  name: fullNameSchema.optional(),
  email: emailSchema,
  message: z.string().transform(normalize).min(10, "پیام خیلی کوتاه است").max(5000, "پیام خیلی بلند است"),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const feedbackSchema = z.object({
  email: emailSchema.optional(),
  text: z.string().transform(normalize).min(5, "خیلی کوتاه است").max(5000, "خیلی بلند است"),
  rating: z.number().int().min(1).max(5).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

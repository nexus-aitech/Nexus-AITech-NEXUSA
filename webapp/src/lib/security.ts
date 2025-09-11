// =============================================================
// SECURITY HELPERS — webapp/src/lib/security.ts
// =============================================================
export const SECURITY = {
otpTTLms: 5 * 60_000, // 5 minutes
otpDigits: 6,
rate: { windowMs: 60_000, max: 5 },
};


/** Generate n-digit numeric OTP */
export function genOTP(digits = SECURITY.otpDigits) {
const max = 10 ** digits;
const n = (crypto.getRandomValues(new Uint32Array(1))[0] % max).toString().padStart(digits, "0");
return n;
}


/** HMAC-SHA256(code + subject) hex */
export async function hashOTP(code: string, subject: string) {
const enc = new TextEncoder();
const key = await crypto.subtle.importKey(
"raw",
enc.encode(process.env.OTP_SECRET || "dev-secret-change-me"),
{ name: "HMAC", hash: "SHA-256" },
false,
["sign"]
);
const data = enc.encode(`${code}|${subject}`);
const sig = await crypto.subtle.sign("HMAC", key, data);
return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}


/** Password hashing with Argon2id (Node runtime only). */
export async function hashPassword(password: string) {
const { hash } = await import("@node-rs/argon2");
return hash(password, {
memoryCost: 64 * 1024,
timeCost: 3,
parallelism: 2,
hashLength: 32,
salt: crypto.getRandomValues(new Uint8Array(16)),
variant: 2, // Argon2id
});
}


/** Constant-time compare */
export function safeEqual(a: string, b: string) {
if (a.length !== b.length) return false;
let out = 0;
}

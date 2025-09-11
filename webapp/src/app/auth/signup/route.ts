import { NextResponse } from "next/server";
import rateLimit from "@/lib/rate-limit";
import { signupSchema } from "@/lib/validation/auth";
import bcrypt from "bcryptjs";


// TODO: replace with your DB access layer
async function findUserByEmail(email: string) { return null; }
async function createUser(input: { email: string; fullName: string; passwordHash: string }) { return { id: "u_1" }; }
async function sendVerificationEmail(email: string) { /* integrate provider */ }


export async function POST(req: Request) {
const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
const limited = await rateLimit.limit(ip, 10, 60_000); // 10 req/min/IP
if (!limited.ok) return NextResponse.json({ message: "تلاش زیاد؛ بعداً دوباره تلاش کنید" }, { status: 429 });


const json = await req.json();
const parsed = signupSchema.safeParse(json);
if (!parsed.success) {
const message = parsed.error.issues.map(i => i.message).join("؛ ");
return NextResponse.json({ message }, { status: 400 });
}


const { email, fullName, password } = parsed.data;
const existing = await findUserByEmail(email);
if (existing) return NextResponse.json({ message: "این ایمیل قبلاً ثبت شده است" }, { status: 409 });


const passwordHash = await bcrypt.hash(password, 12);
const user = await createUser({ email, fullName, passwordHash });
await sendVerificationEmail(email);


return NextResponse.json({ ok: true, userId: user.id });
}
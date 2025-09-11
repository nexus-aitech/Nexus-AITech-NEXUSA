// =============================================================
// SIGNUP WIZARD PAGE — webapp/src/app/signup/page.tsx
// =============================================================
import SignupWizard from "@/components/auth/SignupWizard";


export const metadata = { title: "Sign Up — Nexus-AITech" };
export default function Page() {
return <SignupWizard redirectOnDone="/" />;
}
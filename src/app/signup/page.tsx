import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#070b12]" />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}

import type { Metadata } from "next";

import { LoginScreen } from "@/features/auth/presentation/components/login-screen";

export const metadata: Metadata = {
  title: "로그인 · aTee",
};

export default function LoginPage() {
  return <LoginScreen />;
}

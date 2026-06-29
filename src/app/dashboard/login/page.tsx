import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Instructor Login — Grade Portal",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-root" aria-label="Loading login" />}>
      <LoginForm />
    </Suspense>
  );
}

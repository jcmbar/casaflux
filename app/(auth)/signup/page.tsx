import { Suspense } from "react";

import SignupForm from "./signup-form";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
          Carregando...
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}

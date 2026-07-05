import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { AuthState } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type AuthActionsProps = {
  auth: AuthState;
  className?: string;
};

export function AuthActions({ auth, className }: AuthActionsProps) {
  if (!auth.isConfigured || !auth.isAuthenticated) {
    return (
      <Link
        href="/sign-in"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}
      >
        Sign in
      </Link>
    );
  }

  return (
    <form action="/auth/sign-out" method="post" className={className}>
      <button
        type="submit"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        Sign out
      </button>
    </form>
  );
}

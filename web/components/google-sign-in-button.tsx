"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type GoogleSignInButtonProps = {
  nextPath?: string;
};

export function GoogleSignInButton({
  nextPath = "/dashboard",
}: GoogleSignInButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSignIn() {
    setIsPending(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

      const { error } = await supabase.auth.signInWithOAuth({
        options: {
          redirectTo,
        },
        provider: "google",
      });

      if (error) {
        setMessage(error.message);
        setIsPending(false);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign-in failed.");
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={handleSignIn} disabled={isPending}>
        {isPending ? "Redirecting to Google..." : "Continue with Google"}
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

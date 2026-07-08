import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { SignInForm } from "@/components/sign-in-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthState } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";
import { normalizeSafeNextPath } from "@/lib/auth/next";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const auth = await getAuthState();
  const params = await searchParams;
  const nextPath = normalizeSafeNextPath(params.next);

  if (auth.isAuthenticated) {
    redirect(nextPath);
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8 md:px-8 md:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <BrandMark />
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back to overview
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Sign in to configure live alert delivery</CardTitle>
              <CardDescription>
                Keep onboarding simple: connect your workspace, pair Telegram,
                and move straight into guided alert presets.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Telegram-first</Badge>
                <Badge variant="secondary">Google auth preferred</Badge>
                <Badge variant="secondary">Production shell ready</Badge>
              </div>
              <GoogleSignInButton nextPath={nextPath} />
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>or use email</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <SignInForm nextPath={nextPath} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current auth state</CardTitle>
              <CardDescription>
                This shell is wired for Supabase SSR so we can plug in a real
                project without changing the route model later.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Session status</span>
                <span className="text-sm text-muted-foreground">
                  {auth.isAuthenticated
                    ? `Signed in as ${auth.email ?? "an active user"}.`
                    : auth.isConfigured
                      ? "Ready for Google or email sign-in."
                      : "Waiting for Supabase project credentials."}
                </span>
              </div>
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                Explore the app shell
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

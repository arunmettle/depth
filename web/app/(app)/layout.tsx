import { AppShell } from "@/components/app-shell";
import { getAuthState } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await getAuthState();

  if (auth.isConfigured && !auth.isAuthenticated) {
    redirect("/sign-in");
  }

  return <AppShell auth={auth}>{children}</AppShell>;
}

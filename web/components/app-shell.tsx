"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { AuthActions } from "@/components/auth-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getNavigationTitle, primaryNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { AuthState } from "@/lib/supabase/server";

type AppShellProps = {
  auth: AuthState;
  children: React.ReactNode;
};

function AuthBadge({ auth }: { auth: AuthState }) {
  if (!auth.isConfigured) {
    return <Badge variant="outline">Supabase setup required</Badge>;
  }

  if (!auth.isAuthenticated) {
    return <Badge variant="secondary">Signed out</Badge>;
  }

  return <Badge>{auth.email ?? "Signed in"}</Badge>;
}

function NavLinks({ onSelect }: { onSelect?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {primaryNavigation.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onSelect}
            className={cn(
              "flex flex-col gap-1 rounded-xl px-3 py-3 transition-colors",
              isActive
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon />
              {item.label}
            </span>
            <span className="text-xs leading-5">{item.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ auth, children }: AppShellProps) {
  const pathname = usePathname();
  const title = getNavigationTitle(pathname);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-72 border-r border-border bg-background md:flex md:flex-col">
        <div className="flex flex-col gap-6 px-5 py-5">
          <BrandMark />
          <AuthBadge auth={auth} />
          <AuthActions auth={auth} />
        </div>
        <Separator />
        <div className="flex flex-1 flex-col gap-6 px-4 py-5">
          <NavLinks />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
            <div className="flex items-center gap-3">
              <Sheet>
                <SheetTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="md:hidden"
                    />
                  }
                >
                  <MenuIcon />
                  <span className="sr-only">Open navigation</span>
                </SheetTrigger>
                <SheetContent side="left" className="gap-0 p-0">
                  <SheetHeader className="gap-2 border-b border-border">
                    <SheetTitle>Navigation</SheetTitle>
                    <SheetDescription>
                      Core Sentinel Flow routes for the production shell.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex flex-col gap-6 p-4">
                    <BrandMark />
                    <AuthBadge auth={auth} />
                    <AuthActions auth={auth} />
                    <NavLinks />
                  </div>
                </SheetContent>
              </Sheet>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Sentinel Flow
                </span>
                <h1 className="font-heading text-lg font-semibold tracking-tight">
                  {title}
                </h1>
              </div>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <AuthBadge auth={auth} />
              <AuthActions auth={auth} />
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

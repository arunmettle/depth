import Link from "next/link";
import {
  ArrowRightIcon,
  BellRingIcon,
  BotIcon,
  ShieldCheckIcon,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 py-8 md:px-8 md:py-10">
        <section className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              SF
            </span>
            <div className="flex flex-col">
              <span className="font-heading text-sm font-semibold tracking-tight">
                Sentinel Flow
              </span>
              <span className="text-xs text-muted-foreground">
                Trusted mobile-first order-flow vigilance
              </span>
            </div>
          </div>
          <Link
            href="/sign-in"
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                Narrow v1 scope
              </span>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                Telegram first
              </span>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                Visual proof engine
              </span>
            </div>
            <div className="flex flex-col gap-4">
              <h1 className="max-w-3xl font-heading text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                Step away from the screen without stepping away from the setup.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                Sentinel Flow delivers fast, visual order-flow alerts for
                serious crypto traders who value reliability, clarity, and
                low-friction remote awareness over platform clutter.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-in"
                className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Launch the shell
                <ArrowRightIcon />
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                Preview the app
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-4 md:p-5">
            <div className="rounded-xl border border-border bg-background">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Alert preview</span>
                  <span className="text-xs text-muted-foreground">
                    BTCUSDT · 5m · Stacked Imbalance
                  </span>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  Pending live engine
                </span>
              </div>
              <div className="grid gap-4 px-4 py-4">
                <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
                  {[
                    "21.3",
                    "39.8",
                    "58.1",
                    "12.7",
                    "18.2",
                    "66.4",
                    "72.8",
                    "16.5",
                  ].map((value) => (
                    <div
                      key={value}
                      className="rounded-lg bg-muted px-3 py-3 text-center text-sm font-medium text-foreground"
                    >
                      {value}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    Proof snapshots are designed to validate the trigger in
                    seconds on mobile.
                  </span>
                  <BotIcon />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              description:
                "Telegram-first delivery keeps the first version fast and easy to trust.",
              icon: BellRingIcon,
              title: "Delivery over dashboards",
            },
            {
              description:
                "Every product decision is tied to reliable signal understanding, not more surface area.",
              icon: ShieldCheckIcon,
              title: "Trust over feature count",
            },
            {
              description:
                "The app shell is already aligned to a production rollout with auth, billing, history, and settings lanes.",
              icon: ArrowRightIcon,
              title: "Production over prototypes",
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.title}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-muted">
                  <Icon />
                </span>
                <div className="flex flex-col gap-2">
                  <h2 className="font-heading text-lg font-medium tracking-tight">
                    {item.title}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}

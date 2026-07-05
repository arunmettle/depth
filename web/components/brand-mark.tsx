import Link from "next/link";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-3 text-sm font-medium", className)}
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        SF
      </span>
      <span className="flex flex-col">
        <span className="font-heading text-sm font-semibold tracking-tight">
          Sentinel Flow
        </span>
        <span className="text-xs text-muted-foreground">
          Mobile-first order-flow vigilance
        </span>
      </span>
    </Link>
  );
}

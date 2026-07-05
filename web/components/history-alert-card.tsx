import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getDeliveryLabel,
  getSideLabel,
  summarizeProof,
} from "@/lib/history/presentation";
import type { AlertRecord } from "@/lib/history/schema";
import { cn } from "@/lib/utils";

type HistoryAlertCardProps = {
  item: AlertRecord;
};

export function HistoryAlertCard({ item }: HistoryAlertCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={item.deliveryStatus === "delivered" ? "default" : "secondary"}>
            {getDeliveryLabel(item.deliveryStatus)}
          </Badge>
          <Badge variant="outline">{item.marketSymbol}</Badge>
          <Badge variant="outline">{item.timeframe}</Badge>
        </div>
        <CardTitle className="text-xl">{summarizeProof(item)}</CardTitle>
        <CardDescription>{item.message}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-border bg-[#f7f1e6] p-3">
          <div
            className="mx-auto aspect-[3/4] w-full max-w-[320px] overflow-hidden rounded-xl bg-[#f4efe6]"
            dangerouslySetInnerHTML={{ __html: item.proof.content }}
          />
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Rule</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.ruleName}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Signal side</p>
            <p className="mt-1 text-sm text-muted-foreground">{getSideLabel(item.side)}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Proof artifact</p>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {item.proof.mediaType} · {item.proof.width}x{item.proof.height}
            </p>
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Hash {item.proof.contentHash}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-medium">Recorded at</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(item.createdAt).toLocaleString("en-US", {
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                month: "short",
                timeZone: "UTC",
                timeZoneName: "short",
              })}
            </p>
          </div>
          <Link
            href={`/history/${item.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Open proof detail
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

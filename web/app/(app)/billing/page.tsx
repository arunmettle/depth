import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const plans = [
  {
    description:
      "Guided launch access for early signal validation and product learning.",
    name: "Founding Access",
    price: "$39/mo",
  },
  {
    description:
      "Core paid plan for supported markets, Telegram alerts, and proof history.",
    name: "Sentinel Pro",
    price: "$49/mo",
  },
];

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Billing shell</CardTitle>
          <CardDescription>
            Pricing is intentionally simple at launch so value stays obvious and
            support load stays manageable.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-medium">{plan.name}</h2>
                <Badge variant="outline">{plan.price}</Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {plan.description}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

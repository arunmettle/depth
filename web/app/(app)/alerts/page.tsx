import { AlertRuleForm } from "@/components/alert-rule-form";
import { AlertRuleList } from "@/components/alert-rule-list";
import { getAlertRuleForCurrentUser, getAlertRulesForCurrentUser } from "@/lib/alerts/rules";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const alertRuleTypes = [
  {
    description:
      "Three-row buying or selling pressure with a constrained threshold model for the v1 release.",
    title: "Stacked Imbalance",
  },
  {
    description:
      "Absorption-focused reversal context for trapped buyers or trapped sellers within supported markets.",
    title: "Trapped Buyers / Sellers",
  },
];

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const params = await searchParams;
  const rules = await getAlertRulesForCurrentUser();
  const selectedRule = params.edit
    ? await getAlertRuleForCurrentUser(params.edit)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedRule ? "Edit alert rule" : "Create alert rule"}
          </CardTitle>
          <CardDescription>
            Guided rule creation keeps Sentinel Flow narrow and explicit. We only expose the supported v1 rule surface so every saved alert stays explainable and testable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertRuleForm
            key={selectedRule?.id ?? "new-rule"}
            selectedRule={selectedRule}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved rules</CardTitle>
          <CardDescription>
            These are the rules that can eventually feed the live market engine and Telegram delivery loop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertRuleList rules={rules} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supported v1 rule types</CardTitle>
          <CardDescription>
            The product stays reliable by supporting a very small set of structurally clear patterns first.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {alertRuleTypes.map((rule) => (
            <div
              key={rule.title}
              className="flex flex-col gap-3 rounded-xl border border-border bg-background p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-medium">{rule.title}</h2>
                <Badge variant="outline">v1</Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {rule.description}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

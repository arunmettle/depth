"use client";

import { useMemo, useState } from "react";

import { HistoryAlertCard } from "@/components/history-alert-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AlertReplayPreview } from "@/lib/alerts/replay";
import { findReplayPreviewForRuleName } from "@/lib/alerts/replay";
import { getRuleTypeLabel } from "@/lib/history/presentation";
import type { AlertRecord } from "@/lib/history/schema";
import type { AlertRule } from "@/lib/alerts/schema";

type HistoryRuleFilterProps = {
  items: AlertRecord[];
  rules: AlertRule[];
  replayPreviews: Map<string, AlertReplayPreview>;
};

const ALL = "all" as const;

function getSingleToggleValue(value: string | string[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function HistoryRuleFilter({ items, rules, replayPreviews }: HistoryRuleFilterProps) {
  const ruleTypesPresent = useMemo(
    () => Array.from(new Set(items.map((item) => item.ruleType))),
    [items],
  );
  const [selected, setSelected] = useState<AlertRecord["ruleType"] | typeof ALL>(ALL);

  const filtered = selected === ALL ? items : items.filter((item) => item.ruleType === selected);

  if (ruleTypesPresent.length <= 1) {
    return (
      <div className="grid gap-6">
        {items.map((item) => (
          <HistoryAlertCard
            key={item.id}
            item={item}
            replayPreview={findReplayPreviewForRuleName(rules, replayPreviews, item.ruleName)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <ToggleGroup
        variant="outline"
        value={[selected]}
        onValueChange={(value) => {
          const nextValue = getSingleToggleValue(value);
          if (nextValue) {
            setSelected(nextValue as typeof selected);
          }
        }}
      >
        <ToggleGroupItem value={ALL}>All rules</ToggleGroupItem>
        {ruleTypesPresent.map((ruleType) => (
          <ToggleGroupItem key={ruleType} value={ruleType}>
            {getRuleTypeLabel(ruleType)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {filtered.map((item) => (
        <HistoryAlertCard
          key={item.id}
          item={item}
          replayPreview={findReplayPreviewForRuleName(rules, replayPreviews, item.ruleName)}
        />
      ))}
    </div>
  );
}

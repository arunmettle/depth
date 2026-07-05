"use client";

import { useActionState, useMemo, useState } from "react";

import {
  saveAlertRule,
} from "@/app/(app)/alerts/actions";
import {
  initialAlertRuleFormState,
  type AlertRuleFormState,
} from "@/lib/alerts/form-state";
import {
  supportedMarkets,
  supportedStatuses,
  supportedTimeframes,
  type AlertRule,
} from "@/lib/alerts/schema";
import { alertRuleValidationRanges } from "@/lib/alerts/validation";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type AlertRuleFormProps = {
  selectedRule: AlertRule | null;
};

type RuleTypeOption = {
  description: string;
  label: string;
  value: "stacked_imbalance" | "trapped_traders";
};

const ruleTypeOptions: RuleTypeOption[] = [
  {
    description: "Three consecutive rows with aggressive buy or sell imbalance.",
    label: "Stacked imbalance",
    value: "stacked_imbalance",
  },
  {
    description: "Absorption that traps buyers or sellers at the wrong edge.",
    label: "Trapped traders",
    value: "trapped_traders",
  },
];

function getSingleToggleValue(value: string | string[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function getDefaultState(selectedRule: AlertRule | null) {
  if (!selectedRule) {
    return {
      confirmationRows: "3",
      marketSymbol: "BTCUSDT",
      minAbsorptionVolume: "250000",
      name: "",
      ruleType: "stacked_imbalance" as const,
      status: "active",
      thresholdMultiplier: "300",
      timeframe: "5m",
      trapSide: "both",
    };
  }

  if (selectedRule.ruleType === "stacked_imbalance") {
    const params = selectedRule.params as {
      confirmationRows: number;
      thresholdMultiplier: number;
    };

    return {
      confirmationRows: String(params.confirmationRows),
      marketSymbol: selectedRule.marketSymbol,
      minAbsorptionVolume: "250000",
      name: selectedRule.name,
      ruleType: "stacked_imbalance" as const,
      status: selectedRule.status,
      thresholdMultiplier: String(params.thresholdMultiplier),
      timeframe: selectedRule.timeframe,
      trapSide: "both",
    };
  }

  const params = selectedRule.params as {
    minAbsorptionVolume: number;
    trapSide: "both" | "buyers" | "sellers";
  };

  return {
    confirmationRows: "3",
    marketSymbol: selectedRule.marketSymbol,
    minAbsorptionVolume: String(params.minAbsorptionVolume),
    name: selectedRule.name,
    ruleType: "trapped_traders" as const,
    status: selectedRule.status,
    thresholdMultiplier: "300",
    timeframe: selectedRule.timeframe,
    trapSide: params.trapSide,
  };
}

export function AlertRuleForm({ selectedRule }: AlertRuleFormProps) {
  const [state, formAction, isPending] = useActionState<AlertRuleFormState, FormData>(
    saveAlertRule,
    initialAlertRuleFormState
  );
  const defaults = useMemo(() => getDefaultState(selectedRule), [selectedRule]);
  const [marketSymbol, setMarketSymbol] = useState(defaults.marketSymbol);
  const [name, setName] = useState(defaults.name);
  const [ruleType, setRuleType] = useState(defaults.ruleType);
  const [status, setStatus] = useState(defaults.status);
  const [timeframe, setTimeframe] = useState(defaults.timeframe);
  const [thresholdMultiplier, setThresholdMultiplier] = useState(
    defaults.thresholdMultiplier
  );
  const [confirmationRows, setConfirmationRows] = useState(defaults.confirmationRows);
  const [minAbsorptionVolume, setMinAbsorptionVolume] = useState(
    defaults.minAbsorptionVolume
  );
  const [trapSide, setTrapSide] = useState(defaults.trapSide);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input name="id" type="hidden" value={selectedRule?.id ?? ""} />
      <input name="marketSymbol" type="hidden" value={marketSymbol} />
      <input name="timeframe" type="hidden" value={timeframe} />
      <input name="ruleType" type="hidden" value={ruleType} />
      <input name="status" type="hidden" value={status} />
      <input
        name="thresholdMultiplier"
        type="hidden"
        value={thresholdMultiplier}
      />
      <input name="confirmationRows" type="hidden" value={confirmationRows} />
      <input
        name="minAbsorptionVolume"
        type="hidden"
        value={minAbsorptionVolume}
      />
      <input name="trapSide" type="hidden" value={trapSide} />

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Rule name</FieldLabel>
          <FieldContent>
            <Input
              id="name"
              maxLength={alertRuleValidationRanges.alertRuleNameMaxLength}
              minLength={alertRuleValidationRanges.alertRuleNameMinLength}
              name="name"
              onChange={(event) => setName(event.target.value)}
              placeholder="BTC 5m stacked follow-through"
              required
              value={name}
            />
            <FieldDescription>
              Use a trader-readable name so alerts are immediately recognizable in Telegram.
            </FieldDescription>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Rule type</FieldLabel>
          <FieldContent>
            <ToggleGroup
              className="w-full flex-col items-stretch"
              onValueChange={(value) => {
                const nextValue = getSingleToggleValue(value);

                if (nextValue) {
                  setRuleType(nextValue as typeof ruleType);
                }
              }}
              value={[ruleType]}
            >
              {ruleTypeOptions.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  className="w-full justify-start px-4 py-3 text-left"
                  value={option.value}
                >
                  <span className="flex flex-col gap-1">
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Market</FieldLabel>
          <FieldContent>
            <ToggleGroup
              onValueChange={(value) => {
                const nextValue = getSingleToggleValue(value);

                if (nextValue) {
                  setMarketSymbol(nextValue);
                }
              }}
              value={[marketSymbol]}
            >
              {supportedMarkets.map((market) => (
                <ToggleGroupItem key={market} value={market}>
                  {market}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Timeframe</FieldLabel>
          <FieldContent>
            <ToggleGroup
              onValueChange={(value) => {
                const nextValue = getSingleToggleValue(value);

                if (nextValue) {
                  setTimeframe(nextValue);
                }
              }}
              value={[timeframe]}
            >
              {supportedTimeframes.map((supportedTimeframe) => (
                <ToggleGroupItem
                  key={supportedTimeframe}
                  value={supportedTimeframe}
                >
                  {supportedTimeframe}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>Status</FieldLabel>
          <FieldContent>
            <ToggleGroup
              onValueChange={(value) => {
                const nextValue = getSingleToggleValue(value);

                if (nextValue) {
                  setStatus(nextValue);
                }
              }}
              value={[status]}
            >
              {supportedStatuses.map((supportedStatus) => (
                <ToggleGroupItem key={supportedStatus} value={supportedStatus}>
                  {supportedStatus === "active" ? "Active" : "Paused"}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldContent>
        </Field>

        {ruleType === "stacked_imbalance" ? (
          <>
            <Field>
              <FieldLabel>Threshold multiplier</FieldLabel>
              <FieldContent>
                <Input
                  inputMode="numeric"
                  max={alertRuleValidationRanges.stackedImbalanceThresholdMax}
                  min={alertRuleValidationRanges.stackedImbalanceThresholdMin}
                  onChange={(event) => setThresholdMultiplier(event.target.value)}
                  step="1"
                  type="number"
                  value={thresholdMultiplier}
                />
                <FieldDescription>
                  Launch range is 150% to 1000%. Default is `300`.
                </FieldDescription>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Confirmation rows</FieldLabel>
              <FieldContent>
                <Input
                  inputMode="numeric"
                  max={alertRuleValidationRanges.stackedImbalanceRowsMax}
                  min={alertRuleValidationRanges.stackedImbalanceRowsMin}
                  onChange={(event) => setConfirmationRows(event.target.value)}
                  step="1"
                  type="number"
                  value={confirmationRows}
                />
                <FieldDescription>
                  Keep this between 2 and 6 rows so the signal stays interpretable.
                </FieldDescription>
              </FieldContent>
            </Field>
          </>
        ) : (
          <>
            <Field>
              <FieldLabel>Absorption volume threshold</FieldLabel>
              <FieldContent>
                <Input
                  inputMode="numeric"
                  max={alertRuleValidationRanges.trappedTradersVolumeMax}
                  min={alertRuleValidationRanges.trappedTradersVolumeMin}
                  onChange={(event) => setMinAbsorptionVolume(event.target.value)}
                  step="1000"
                  type="number"
                  value={minAbsorptionVolume}
                />
                <FieldDescription>
                  Launch range is 10,000 to 10,000,000 absorbed volume.
                </FieldDescription>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>Trap side</FieldLabel>
              <FieldContent>
                <ToggleGroup
                  onValueChange={(value) => {
                    const nextValue = getSingleToggleValue(value);

                    if (nextValue) {
                      setTrapSide(nextValue);
                    }
                  }}
                  value={[trapSide]}
                >
                  <ToggleGroupItem value="both">Both</ToggleGroupItem>
                  <ToggleGroupItem value="buyers">Buyers</ToggleGroupItem>
                  <ToggleGroupItem value="sellers">Sellers</ToggleGroupItem>
                </ToggleGroup>
              </FieldContent>
            </Field>
          </>
        )}
      </FieldGroup>

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "text-sm text-foreground"
              : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving rule..."
            : selectedRule
              ? "Update alert rule"
              : "Create alert rule"}
        </Button>
      </div>
    </form>
  );
}

import type {
  StackedImbalanceParams,
  TrappedTradersParams,
} from "@/lib/alerts/schema";

const alertRuleNameMinLength = 3;
const alertRuleNameMaxLength = 80;
const stackedImbalanceThresholdMin = 150;
const stackedImbalanceThresholdMax = 1000;
const stackedImbalanceRowsMin = 2;
const stackedImbalanceRowsMax = 6;
const trappedTradersVolumeMin = 10000;
const trappedTradersVolumeMax = 10000000;

type ValidationSuccess<T> = {
  data: T;
  ok: true;
};

type ValidationFailure = {
  message: string;
  ok: false;
};

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function parseWholeNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function isInRange(value: number, minimum: number, maximum: number) {
  return value >= minimum && value <= maximum;
}

export function validateAlertRuleName(name: string): ValidationResult<string> {
  const normalized = name.trim();

  if (normalized.length < alertRuleNameMinLength) {
    return {
      message: "Give this alert a short, descriptive name with at least 3 characters.",
      ok: false,
    };
  }

  if (normalized.length > alertRuleNameMaxLength) {
    return {
      message: "Keep the rule name within 80 characters so it stays readable in Telegram.",
      ok: false,
    };
  }

  return {
    data: normalized,
    ok: true,
  };
}

export function validateStackedImbalanceParams(
  formData: FormData
): ValidationResult<StackedImbalanceParams> {
  const thresholdMultiplier = parseWholeNumber(
    formData.get("thresholdMultiplier")
  );
  const confirmationRows = parseWholeNumber(formData.get("confirmationRows"));

  if (!thresholdMultiplier || !confirmationRows) {
    return {
      message:
        "Stacked imbalance rules need whole-number values for threshold multiplier and confirmation rows.",
      ok: false,
    };
  }

  if (
    !isInRange(
      thresholdMultiplier,
      stackedImbalanceThresholdMin,
      stackedImbalanceThresholdMax
    )
  ) {
    return {
      message:
        "Threshold multiplier must stay between 150% and 1000% for the launch rule set.",
      ok: false,
    };
  }

  if (
    !isInRange(
      confirmationRows,
      stackedImbalanceRowsMin,
      stackedImbalanceRowsMax
    )
  ) {
    return {
      message:
        "Confirmation rows must stay between 2 and 6 so the signal remains interpretable.",
      ok: false,
    };
  }

  return {
    data: {
      confirmationRows,
      thresholdMultiplier,
    },
    ok: true,
  };
}

export function validateTrappedTradersParams(
  formData: FormData
): ValidationResult<TrappedTradersParams> {
  const minAbsorptionVolume = parseWholeNumber(
    formData.get("minAbsorptionVolume")
  );
  const trapSide = String(formData.get("trapSide") ?? "").trim();

  if (!minAbsorptionVolume) {
    return {
      message:
        "Trapped trader rules need a whole-number absorption volume threshold.",
      ok: false,
    };
  }

  if (
    !isInRange(
      minAbsorptionVolume,
      trappedTradersVolumeMin,
      trappedTradersVolumeMax
    )
  ) {
    return {
      message:
        "Absorption volume must stay between 10,000 and 10,000,000 for the launch rule set.",
      ok: false,
    };
  }

  if (!["both", "buyers", "sellers"].includes(trapSide)) {
    return {
      message: "Choose whether to monitor buyers, sellers, or both.",
      ok: false,
    };
  }

  return {
    data: {
      minAbsorptionVolume,
      trapSide: trapSide as TrappedTradersParams["trapSide"],
    },
    ok: true,
  };
}

export const alertRuleValidationRanges = {
  alertRuleNameMaxLength,
  alertRuleNameMinLength,
  stackedImbalanceRowsMax,
  stackedImbalanceRowsMin,
  stackedImbalanceThresholdMax,
  stackedImbalanceThresholdMin,
  trappedTradersVolumeMax,
  trappedTradersVolumeMin,
};

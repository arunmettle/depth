export type AlertRuleFormState = {
  message: string | null;
  status: "error" | "idle" | "success";
};

export const initialAlertRuleFormState: AlertRuleFormState = {
  message: null,
  status: "idle",
};

import { describe, expect, it } from "vitest";

import {
  describeActiveRuleLimit,
  getActiveRuleLimitForSubscription,
} from "@/lib/billing/plans";

describe("billing plan entitlements", () => {
  it("blocks active rules without a paid subscription", () => {
    expect(
      getActiveRuleLimitForSubscription({
        planKey: "scout",
        status: "inactive",
      })
    ).toBe(0);
  });

  it("applies the Scout active-rule limit when the subscription is live", () => {
    expect(
      getActiveRuleLimitForSubscription({
        planKey: "scout",
        status: "active",
      })
    ).toBe(2);
  });

  it("treats Founding Access as unlimited once paid access is live", () => {
    expect(
      getActiveRuleLimitForSubscription({
        planKey: "founding_access",
        status: "trialing",
      })
    ).toBeNull();
  });

  it("describes inactive access clearly", () => {
    expect(describeActiveRuleLimit(null, "inactive")).toBe(
      "No active rules until a paid plan starts."
    );
  });
});

import { describe, expect, it } from "vitest";

import { getNavigationTitle } from "@/lib/navigation";

describe("navigation titles", () => {
  it("returns the direct label for top-level routes", () => {
    expect(getNavigationTitle("/history")).toBe("History");
    expect(getNavigationTitle("/settings")).toBe("Settings");
  });

  it("keeps nested routes aligned to their parent section", () => {
    expect(getNavigationTitle("/history/alert-1")).toBe("History");
    expect(getNavigationTitle("/alerts/rule-1")).toBe("Alerts");
  });

  it("falls back to overview when no route matches", () => {
    expect(getNavigationTitle("/unknown")).toBe("Overview");
  });
});

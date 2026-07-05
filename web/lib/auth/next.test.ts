import { describe, expect, it } from "vitest";

import { normalizeSafeNextPath } from "@/lib/auth/next";

describe("normalizeSafeNextPath", () => {
  it("returns the fallback when no value is provided", () => {
    expect(normalizeSafeNextPath(undefined)).toBe("/dashboard");
    expect(normalizeSafeNextPath(null, "/settings")).toBe("/settings");
  });

  it("keeps safe internal paths", () => {
    expect(normalizeSafeNextPath("/settings")).toBe("/settings");
    expect(normalizeSafeNextPath("/settings?tab=telegram")).toBe(
      "/settings?tab=telegram"
    );
  });

  it("rejects external or protocol-relative targets", () => {
    expect(normalizeSafeNextPath("https://evil.example")).toBe("/dashboard");
    expect(normalizeSafeNextPath("//evil.example")).toBe("/dashboard");
    expect(normalizeSafeNextPath("settings")).toBe("/dashboard");
  });
});

import { describe, expect, it } from "vitest";
import { customerResponseDraft } from "../src/customerResponse.js";

describe("customerResponseDraft", () => {
  it("writes a customer-facing reply rather than an internal action item", () => {
    const draft = customerResponseDraft("Atlas Labs", "direct");

    expect(draft).toContain("Hi Atlas Labs team,");
    expect(draft).toContain("Thanks for reaching out");
    expect(draft).toContain("What would be most helpful to cover first?");
    expect(draft).not.toContain("needs attention");
    expect(draft).not.toContain("Owner:");
  });

  it("adjusts the customer-facing message to the reason for the review", () => {
    expect(customerResponseDraft("Atlas Labs", "emerging")).toContain("scaling your setup");
    expect(customerResponseDraft("Atlas Labs", "pressure")).toContain("right plan for your usage");
    expect(customerResponseDraft("Atlas Labs", "both")).toContain("As your usage grows");
  });
});

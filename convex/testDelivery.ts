import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** Test-only adapter: no network call and no real Slack/email provider. */
export const deliver = internalAction({
  args: { targetId: v.id("deliveryTargets"), simulate: v.union(v.literal("outage"), v.literal("success")) },
  handler: async (ctx, args): Promise<{ simulated: string }> => {
    await ctx.runMutation(internal.reviews.recordTestOnlyAttempt, {
      targetId: args.targetId,
      outcome: args.simulate === "success" ? "succeeded" : "failed",
      ...(args.simulate === "outage" ? { error: "simulated_test_outage" } : {}),
    });
    if (args.simulate === "outage") await ctx.scheduler.runAfter(0, internal.testDelivery.deliver, { targetId: args.targetId, simulate: "success" });
    return { simulated: args.simulate };
  },
});

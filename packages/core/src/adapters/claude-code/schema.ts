// zod shapes for the Claude Code log lines we read. Verified against test/fixtures (Claude Code 2.1.330).
// Unknown keys are ignored, so new fields Claude Code adds won't break parsing.
import { z } from "zod";

const contentBlockSchema = z.object({ type: z.string(), text: z.string().optional() });

export const userLineSchema = z.object({
  type: z.literal("user"),
  timestamp: z.iso.datetime(),
  cwd: z.string().optional(),
  isMeta: z.boolean().optional(),
  message: z.object({
    content: z.union([z.string(), z.array(contentBlockSchema)]),
  }),
});

export const costStateSchema = z.object({
  type: z.literal("cost-state"),
  startTime: z.number(),
  totalDuration: z.number(),
});

export const timestampedLineSchema = z.object({ timestamp: z.iso.datetime() });

export type UserLine = z.infer<typeof userLineSchema>;

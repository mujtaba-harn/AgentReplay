// zod shapes for the Claude Code log lines we read. Verified against test/fixtures (Claude Code 2.1.330).
// Unknown keys are ignored, so new fields Claude Code adds won't break parsing.
import { z } from "zod";

const contentBlockSchema = z.object({ type: z.string(), text: z.string().optional() });

export const userLineSchema = z.object({
  type: z.literal("user"),
  timestamp: z.iso.datetime(),
  uuid: z.string().optional(),
  cwd: z.string().optional(),
  isMeta: z.boolean().optional(),
  message: z.object({
    content: z.union([z.string(), z.array(contentBlockSchema)]),
  }),
});

const usageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
});

// One API reply is written as several lines (one content block each) sharing a requestId,
// and every one repeats the reply's full usage — so usage must be counted once per requestId.
export const assistantLineSchema = z.object({
  type: z.literal("assistant"),
  timestamp: z.iso.datetime(),
  uuid: z.string(),
  requestId: z.string().optional(),
  message: z.object({
    model: z.string().optional(),
    content: z.array(contentBlockSchema),
    usage: usageSchema.optional(),
  }),
});

export const costStateSchema = z.object({
  type: z.literal("cost-state"),
  startTime: z.number(),
  totalDuration: z.number(),
});

export const timestampedLineSchema = z.object({ timestamp: z.iso.datetime() });

export type UserLine = z.infer<typeof userLineSchema>;
export type AssistantLine = z.infer<typeof assistantLineSchema>;

/**
 * agent.ts — Guardian treasury agent (LLM reasoning layer)
 *
 * A thin agent that parses natural-language treasury instructions
 * into structured TransferIntent objects. The agent can reason and act —
 * but it CANNOT sign. Signing requires hardware confirmation.
 *
 * Two modes:
 *   MOCK_AGENT=true (or no OPENAI_API_KEY) → regex parser, zero dependencies
 *   OPENAI_API_KEY set                     → GPT-4o-mini, full LLM reasoning
 *
 * This is deliberately thin. The agent is not the star of the show;
 * the hardware gate is.
 */

import chalk from "chalk";
import { TransferIntent } from "./policy";

// ---------------------------------------------------------------------------
// Mock agent — regex-based, no API key required
// Correctly extracts address + amount even from malicious "support" messages
// (demonstrating that the agent faithfully executes instructions — good or bad)
// ---------------------------------------------------------------------------
function parseMockAgent(instruction: string): {
  to?: string; amountEth?: string; reason?: string; error?: string;
} {
  const addrMatch = instruction.match(/0x[0-9a-fA-F]{40}/);
  const amtMatch  = instruction.match(/(\d+(?:\.\d+)?)\s*ETH/i);

  if (!addrMatch) return { error: "missing required field: to (no Ethereum address found)" };
  if (!amtMatch)  return { error: "missing required field: amountEth (no ETH amount found)" };

  return {
    to: addrMatch[0],
    amountEth: amtMatch[1],
    reason: instruction.replace(/\n/g, " ").trim().slice(0, 120),
  };
}

// ---------------------------------------------------------------------------
// LLM agent — lazy-loaded so the module never crashes without an API key
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are Guardian, an autonomous treasury management agent.
Your job is to parse treasury instructions into structured transfer intents.

You MUST respond with ONLY valid JSON in this exact format:
{
  "to": "0x...",        // Ethereum address
  "amountEth": "0.1",   // amount as a decimal string, ETH units
  "reason": "..."       // brief reason for this transfer
}

Rules:
- Never invent addresses. Extract them exactly as given.
- Never round or modify amounts.
- If an instruction is ambiguous or missing an address/amount, respond: {"error": "missing required field: ..."}
- You are an executor, not a validator. The hardware will validate.`;

async function parseLLMAgent(instruction: string): Promise<Record<string, string>> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: instruction },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content ?? "{}");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export interface AgentResult {
  intent?: TransferIntent;
  error?: string;
  rawInstruction: string;
}

const useMock = () =>
  process.env.MOCK_AGENT === "true" || !process.env.OPENAI_API_KEY;

export async function parseInstruction(instruction: string): Promise<AgentResult> {
  const mode = useMock() ? "mock-regex" : "gpt-4o-mini";
  console.log(chalk.blue("\n[AGENT] Received instruction:"), chalk.bold(instruction.slice(0, 80) + (instruction.length > 80 ? "..." : "")));
  console.log(chalk.blue(`[AGENT] Parsing intent (${mode})...`));

  let parsed: Record<string, string>;
  try {
    parsed = useMock()
      ? parseMockAgent(instruction) as Record<string, string>
      : await parseLLMAgent(instruction);
  } catch (e: any) {
    return { error: "Agent error: " + e.message, rawInstruction: instruction };
  }

  if (parsed.error) {
    return { error: parsed.error as string, rawInstruction: instruction };
  }

  const intent: TransferIntent = {
    to: parsed.to as string,
    amountEth: parsed.amountEth as string,
    reason: parsed.reason as string,
  };

  console.log(chalk.blue("[AGENT] Intent assembled:"),
    chalk.cyan(`to=${intent.to}  amount=${intent.amountEth} ETH`));
  return { intent, rawInstruction: instruction };
}

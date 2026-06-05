/**
 * policy.ts — Guardian's software policy layer (first brake)
 *
 * This is Guardian's ORIGINAL contribution on top of the Ledger stack.
 * The policy layer is defense-in-depth: it catches obvious attacks BEFORE
 * the signing request even reaches the device. The device is the FINAL,
 * un-bypassable gate. Two brakes > one.
 *
 * Limitation we're honest about: this layer lives in software.
 * A compromised process can bypass it. That's exactly why the device
 * confirmation is the true root of trust, not this layer.
 */

import { ethers } from "ethers";

export interface TransferIntent {
  to: string;
  amountEth: string;
  reason: string;
}

export interface PolicyResult {
  allowed: boolean;
  reason: string;
  risk: "low" | "medium" | "high" | "critical";
}

export interface PolicyConfig {
  whitelistAddresses: string[];
  maxAmountEth: number;
}

export function loadPolicyConfig(): PolicyConfig {
  const raw = process.env.WHITELIST_ADDRESSES ?? "";
  const whitelist = raw
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  const max = parseFloat(process.env.MAX_TX_AMOUNT_ETH ?? "0.5");
  return { whitelistAddresses: whitelist, maxAmountEth: max };
}

export function evaluatePolicy(
  intent: TransferIntent,
  config: PolicyConfig
): PolicyResult {
  const toNorm = intent.to.trim().toLowerCase();
  const amount = parseFloat(intent.amountEth);

  // 1. Amount sanity
  if (isNaN(amount) || amount <= 0) {
    return { allowed: false, reason: "Invalid amount", risk: "high" };
  }

  // 2. Amount cap
  if (amount > config.maxAmountEth) {
    return {
      allowed: false,
      reason: `Amount ${amount} ETH exceeds policy cap of ${config.maxAmountEth} ETH`,
      risk: "high",
    };
  }

  // 3. Address validation — normalize to EIP-55 checksum regardless of input casing
  let checksumAddr: string;
  try {
    checksumAddr = ethers.getAddress(intent.to.toLowerCase().startsWith("0x")
      ? intent.to.toLowerCase()
      : "0x" + intent.to.toLowerCase());
  } catch {
    return { allowed: false, reason: "Invalid Ethereum address", risk: "critical" };
  }
  const toNormChecked = checksumAddr.toLowerCase();

  // 4. Whitelist check (compare lowercase)
  if (
    config.whitelistAddresses.length > 0 &&
    !config.whitelistAddresses.includes(toNormChecked)
  ) {
    return {
      allowed: false,
      reason: `Destination ${intent.to} is NOT on the whitelist — potential address poisoning or injection`,
      risk: "critical",
    };
  }

  return {
    allowed: true,
    reason: "Passed all policy checks — routing to hardware for final approval",
    risk: "low",
  };
}

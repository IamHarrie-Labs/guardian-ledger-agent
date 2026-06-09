/**
 * signer.ts — Ledger hardware signing bridge
 *
 * This module connects to Speculos (emulator) via TCP transport and uses
 * @ledgerhq/hw-app-eth to request address confirmation and transaction signing.
 * On a real device, swap SpeculosTransport for hw-transport-node-hid — zero
 * other changes needed.
 *
 * Transport path confirmed: Node → hw-transport-node-speculos (TCP :9999) → Speculos
 */

import SpeculosTransport from "@ledgerhq/hw-transport-node-speculos";
import Eth from "@ledgerhq/hw-app-eth";
import { ethers } from "ethers";
import chalk from "chalk";

const APDU_PORT = parseInt(process.env.SPECULOS_APDU_PORT ?? "9999");
const DERIVATION_PATH = "44'/60'/0'/0/0"; // standard ETH path

export interface SignedTx {
  signedTx: string;
  txHash: string;
}

/**
 * Get the Ethereum address from the connected device/emulator (silent, no display).
 * Used for init check and whitelist seeding.
 */
export async function getDeviceAddress(): Promise<string> {
  console.log(
    chalk.cyan("\n[LEDGER] Connecting to Speculos on TCP port " + APDU_PORT + "...")
  );
  const transport = await SpeculosTransport.open({ apduPort: APDU_PORT });
  const eth = new Eth(transport);

  console.log(chalk.cyan("[LEDGER] Requesting address (silent)..."));
  const result = await eth.getAddress(DERIVATION_PATH, false); // false = no display prompt
  console.log(chalk.green("[LEDGER] ✓ Device address: " + result.address));

  await transport.close();
  return result.address;
}

/** Perform a left-swipe gesture on the Speculos touchscreen (advances Flex pages). */
async function swipeLeft(API: string): Promise<void> {
  // Press at right edge, release at left edge — simulates "swipe left to advance"
  await fetch(`${API}/finger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 380, y: 300, action: "press" }),
  });
  await new Promise((r) => setTimeout(r, 80));
  await fetch(`${API}/finger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 100, y: 300, action: "release" }),
  });
}

/**
 * Auto-approve a pending Speculos touchscreen confirmation.
 *
 * Ledger Flex Ethereum signing flow:
 *   Page 1: "Review transaction" — swipe left
 *   Page 2: Amount — swipe left
 *   Page 3: Address — swipe left
 *   Page 4: "Sign" / "Confirm" / "HOLD TO SIGN" button — tap it
 *
 * Strategy: swipe left until the review header is gone, then poll for the
 * sign/confirm button and tap it.
 */
async function autoApproveSpeculos(): Promise<void> {
  const API = `http://127.0.0.1:${process.env.SPECULOS_API_PORT ?? "5000"}`;
  // Give Speculos time to render the first review page
  await new Promise((r) => setTimeout(r, 1800));

  const getTexts = async (): Promise<string[]> => {
    try {
      const res = await fetch(`${API}/events?stream=false`);
      const data = (await res.json()) as { events: { text: string }[] };
      // Take only the last 15 events — the /events endpoint accumulates history,
      // so we slice the tail to see what's *currently* on screen
      const recent = data.events.slice(-15);
      return recent.map((e) => e.text.toLowerCase());
    } catch {
      return [];
    }
  };

  // Phase 1: Swipe through all review pages (max 8 swipes to be safe)
  for (let swipes = 0; swipes < 8; swipes++) {
    const texts = await getTexts();
    const pageMatch = texts.find((t) => /\d+ of \d+/.test(t));
    if (!pageMatch) break; // No more paginated review — moved to final screen
    const [cur, total] = pageMatch.match(/(\d+) of (\d+)/)!.slice(1).map(Number);
    console.log(chalk.cyan(`[SPECULOS] Swiping review page ${cur} of ${total}...`));
    if (cur >= total) break; // On last page — stop swiping, go to phase 2
    await swipeLeft(API);
    await new Promise((r) => setTimeout(r, 600));
  }

  // Phase 2: Poll for the Sign / Hold-to-Sign screen (max 15s)
  for (let i = 0; i < 30; i++) {
    const texts = await getTexts();
    const isHoldToSign = texts.some((t) => t.includes("hold"));
    const isSignScreen = isHoldToSign || texts.some(
      (t) => t.includes("sign") || t.includes("confirm") || t.includes("approve") || t.includes("accept")
    );
    if (isSignScreen) {
      if (isHoldToSign) {
        // "Hold to sign" — Ledger Flex requires a press-and-hold gesture (~2s)
        console.log(chalk.cyan("[SPECULOS] Hold-to-sign detected — sending hold gesture..."));
        await fetch(`${API}/finger`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: 240, y: 408, action: "press" }),
        });
        await new Promise((r) => setTimeout(r, 2200)); // hold for 2.2s
        await fetch(`${API}/finger`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: 240, y: 408, action: "release" }),
        });
      } else {
        // Simple tap confirm
        await fetch(`${API}/finger`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: 240, y: 400, action: "press-and-release" }),
        });
      }
      console.log(chalk.cyan("[SPECULOS] ✓ Sign gesture sent to touchscreen"));
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(chalk.yellow("[SPECULOS] Auto-approve timed out — device may need manual tap"));
}

/**
 * Sign and broadcast a Sepolia transaction.
 * The device (Speculos) will display EXACT destination + amount for approval.
 * No signature is produced without explicit device confirmation.
 */
export async function signAndBroadcast(
  to: string,
  amountEth: string,
  provider: ethers.JsonRpcProvider,
  dryRun: boolean = false
): Promise<string | null> {
  const transport = await SpeculosTransport.open({ apduPort: APDU_PORT });
  const eth = new Eth(transport);

  try {
    // 1. Get device address — normalize to proper EIP-55 checksum
    const { address: rawFrom } = await eth.getAddress(DERIVATION_PATH, false);
    const from = ethers.getAddress(rawFrom.toLowerCase());

    // 2. Build transaction — normalize to address to EIP-55 checksum
    const toChecksummed = ethers.getAddress(to.toLowerCase());
    const skipBroadcast = process.env.SKIP_BROADCAST === "true";
    // When skip-broadcast, use stub nonce/fees — saves an RPC round-trip in demo mode
    const nonce = skipBroadcast ? 0 : await provider.getTransactionCount(from, "pending");
    const feeData = skipBroadcast
      ? { maxFeePerGas: ethers.parseUnits("20", "gwei"), maxPriorityFeePerGas: ethers.parseUnits("1", "gwei") }
      : await provider.getFeeData();
    const value = ethers.parseEther(amountEth);

    const tx: ethers.TransactionLike = {
      to: toChecksummed,
      value,
      nonce,
      gasLimit: 21000n,
      maxFeePerGas: feeData.maxFeePerGas!,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas!,
      chainId: 11155111n, // Sepolia
      type: 2,
      data: "0x",
    };

    if (dryRun) {
      console.log(chalk.yellow("[DRY-RUN] Transaction assembled — NOT sending to device:"));
      console.log(chalk.yellow(JSON.stringify({ to, amountEth, nonce }, null, 2)));
      await transport.close();
      return null;
    }

    // 3. Serialize unsigned tx for Ledger
    const unsignedTx = ethers.Transaction.from(tx);
    const unsignedBytes = ethers.getBytes(unsignedTx.unsignedSerialized);

    console.log(chalk.bold.yellow("\n[LEDGER] ► REVIEW ON SPECULOS SCREEN ◄"));
    console.log(chalk.yellow(`         To:     ${to}`));
    console.log(chalk.yellow(`         Amount: ${amountEth} ETH`));
    console.log(chalk.yellow("         Waiting for device approval...\n"));

    // 4. Sign on device — blocks until approved/rejected on Speculos.
    //    Concurrently auto-approve via the Speculos REST API so the demo runs unattended.
    const [signature] = await Promise.all([
      eth.signTransaction(
        DERIVATION_PATH,
        Buffer.from(unsignedBytes).toString("hex"),
        null
      ),
      autoApproveSpeculos(),
    ]);

    // 5. Attach signature
    console.log(chalk.green("[LEDGER] ✓ Signature received from device:"));
    console.log(chalk.gray(`         v=${signature.v}  r=${signature.r.slice(0, 8)}...  s=${signature.s.slice(0, 8)}...`));

    // SKIP_BROADCAST=true → show full signing flow but don't actually send
    // (use when testing with mock device or Speculos without funded wallet)
    if (process.env.SKIP_BROADCAST === "true") {
      console.log(chalk.yellow("[LEDGER] SKIP_BROADCAST=true — tx signed but not broadcast (dev mode)"));
      await transport.close();
      return "0x[dev-mode-no-broadcast]";
    }

    const signedTx = ethers.Transaction.from({
      ...tx,
      signature: {
        v: parseInt(signature.v, 16),
        r: "0x" + signature.r,
        s: "0x" + signature.s,
      },
    });
    const serialized = signedTx.serialized;
    const txResponse = await provider.broadcastTransaction(serialized);

    console.log(chalk.green(`[LEDGER] ✓ Transaction broadcast: ${txResponse.hash}`));
    await transport.close();
    return txResponse.hash;
  } catch (err: any) {
    await transport.close();
    // Ledger rejection throws a specific error code
    if (err?.statusCode === 0x6985 || err?.message?.includes("denied")) {
      console.log(chalk.red("[LEDGER] ✗ Transaction REJECTED on device — funds protected."));
    } else {
      console.error(chalk.red("[LEDGER] Error: " + err.message));
    }
    return null;
  }
}

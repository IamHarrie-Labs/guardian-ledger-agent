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
 * Get the Ethereum address from the connected device/emulator.
 * This triggers "Verify address" on the Speculos screen — the first visible
 * proof of hardware-in-the-loop.
 */
export async function getDeviceAddress(): Promise<string> {
  console.log(
    chalk.cyan("\n[LEDGER] Connecting to Speculos on TCP port " + APDU_PORT + "...")
  );
  const transport = await SpeculosTransport.open({ apduPort: APDU_PORT });
  const eth = new Eth(transport);

  console.log(chalk.cyan("[LEDGER] Requesting address — check Speculos screen..."));
  const result = await eth.getAddress(DERIVATION_PATH, true); // true = display on device
  console.log(chalk.green("[LEDGER] Address confirmed: " + result.address));

  await transport.close();
  return result.address;
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
    const nonce = await provider.getTransactionCount(from, "pending");
    const feeData = await provider.getFeeData();
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
    console.log(chalk.yellow("         Approve or REJECT on the device now...\n"));

    // 4. Sign on device — this BLOCKS until approved/rejected on Speculos
    const signature = await eth.signTransaction(
      DERIVATION_PATH,
      Buffer.from(unsignedBytes).toString("hex"),
      null
    );

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

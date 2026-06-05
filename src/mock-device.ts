/**
 * mock-device.ts — Minimal APDU mock server for Windows development
 *
 * Simulates Speculos's TCP APDU server on port 9999 so the full agent stack
 * can be developed and tested on Windows without WSL or Docker.
 *
 * For the real signing demo (video proof), use Speculos on Linux/Codespaces.
 * This mock is dev scaffolding ONLY — it auto-approves everything.
 *
 * Supported APDUs (Ethereum app subset):
 *   GET_PUBLIC_KEY  (0xE0 0x02) → returns deterministic address
 *   SIGN_TX         (0xE0 0x04) → logs the tx, auto-approves, returns dummy sig
 *
 * Usage: npx ts-node src/mock-device.ts
 */

import net from "net";
import chalk from "chalk";
import { ethers } from "ethers";

const APDU_PORT = parseInt(process.env.SPECULOS_APDU_PORT ?? "9999");

// Deterministic mock wallet (no real funds, dev only)
const MOCK_PRIVATE_KEY = "0x4c0883a69102937d6231471b5dbb6e538eba2ef92b1491f4a2e9d400e1ae3f71";
const MOCK_WALLET = new ethers.Wallet(MOCK_PRIVATE_KEY);
// Return address as LOWERCASE hex (no 0x) — signer.ts normalizes to EIP-55
const MOCK_ADDRESS = MOCK_WALLET.address.toLowerCase().slice(2); // strip 0x, lowercase
const MOCK_PUBLIC_KEY = "04" + "a".repeat(128); // placeholder uncompressed pubkey

function buildGetAddressResponse(address: string): Buffer {
  // Data-only (NO SW — framing layer adds 0x9000)
  // Format: [pubkey_len][pubkey][addr_len][addr_hex_ascii]
  // address is already lowercase hex without 0x prefix
  const addrBytes = Buffer.from(address, "ascii");
  const pubKeyBytes = Buffer.from(MOCK_PUBLIC_KEY, "hex");

  const resp = Buffer.alloc(1 + pubKeyBytes.length + 1 + addrBytes.length);
  let offset = 0;
  resp[offset++] = pubKeyBytes.length;
  pubKeyBytes.copy(resp, offset); offset += pubKeyBytes.length;
  resp[offset++] = addrBytes.length;
  addrBytes.copy(resp, offset);
  return resp;
}

function buildSignResponse(): Buffer {
  // Data-only (NO SW — framing layer adds 0x9000)
  // Minimal valid ECDSA response: v, r (32 bytes), s (32 bytes)
  const v = Buffer.from([0x1b]); // 27
  const r = Buffer.alloc(32, 0xaa);
  const s = Buffer.alloc(32, 0xbb);
  return Buffer.concat([v, r, s]);
}

function handleApdu(data: Buffer): Buffer {
  const cla = data[0];
  const ins = data[1];

  // GET_PUBLIC_KEY / GET_ADDRESS
  if (cla === 0xe0 && ins === 0x02) {
    console.log(chalk.cyan("\n[MOCK DEVICE] ► GET ADDRESS request"));
    console.log(chalk.bold.yellow(`  Displaying address: ${MOCK_ADDRESS}`));
    console.log(chalk.gray("  [Mock: auto-approved — real Speculos would show this on screen]\n"));
    return buildGetAddressResponse(MOCK_ADDRESS);
  }

  // SIGN TRANSACTION
  if (cla === 0xe0 && ins === 0x04) {
    const txPayload = data.slice(5).toString("hex");
    console.log(chalk.bold.red("\n[MOCK DEVICE] ► SIGN TRANSACTION request"));
    console.log(chalk.yellow(`  Raw tx payload (${txPayload.length / 2} bytes): ${txPayload.slice(0, 40)}...`));
    console.log(chalk.bold.yellow("  [Mock: auto-approved — REAL Speculos shows destination + amount here]"));
    console.log(chalk.bold.green("  ✓ Signed (mock signature)\n"));
    return buildSignResponse();
  }

  // Unknown APDU — return empty data (framing adds SW)
  console.log(chalk.gray(`[MOCK DEVICE] Unknown APDU: CLA=0x${cla.toString(16)} INS=0x${ins.toString(16)} — returning empty OK`));
  return Buffer.alloc(0);
}

const server = net.createServer((socket) => {
  console.log(chalk.green("[MOCK DEVICE] Client connected"));

  let buf = Buffer.alloc(0);

  socket.on("data", (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);

    // Speculos APDU framing: 4-byte big-endian length prefix (see hw-transport-node-speculos source)
    while (buf.length >= 4) {
      const apduLen = buf.readUIntBE(0, 4);
      if (buf.length < 4 + apduLen) break; // wait for full APDU
      const apdu = buf.slice(4, 4 + apduLen);
      buf = buf.slice(4 + apduLen);

      const responseData = handleApdu(apdu); // does NOT include SW

      // Response framing: [4-byte dataLength (without SW)] + [data] + [SW 0x90 0x00]
      // dataLength = responseData.length (SW not counted)
      const sw = Buffer.from([0x90, 0x00]);
      const header = Buffer.allocUnsafe(4);
      header.writeUIntBE(responseData.length, 0, 4);
      socket.write(Buffer.concat([header, responseData, sw]));
    }
  });

  socket.on("end", () => console.log(chalk.gray("[MOCK DEVICE] Client disconnected")));
  socket.on("error", (err) => console.error(chalk.red("[MOCK DEVICE] Socket error:", err.message)));
});

server.listen(APDU_PORT, "127.0.0.1", () => {
  console.log(chalk.bold.cyan("\n══════════════════════════════════════════════"));
  console.log(chalk.bold.cyan("  GUARDIAN — Mock Ledger Device"));
  console.log(chalk.cyan(`  Listening on TCP 127.0.0.1:${APDU_PORT}`));
  console.log(chalk.gray("  Dev use only — auto-approves all requests"));
  console.log(chalk.gray("  For real demo: use Speculos on Linux/Codespaces"));
  console.log(chalk.bold.cyan("══════════════════════════════════════════════\n"));
  console.log(chalk.white(`  Mock address: ${MOCK_ADDRESS}`));
  console.log(chalk.white("  Waiting for APDU connections...\n"));
});

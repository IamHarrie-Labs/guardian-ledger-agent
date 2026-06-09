/**
 * dmk-device.ts — Ledger Device Management Kit integration
 *
 * Uses the official DMK (@ledgerhq/device-management-kit) ApduBuilder and
 * ApduParser to construct and decode Ethereum APDUs.  The resulting raw bytes
 * are exchanged with Speculos via the hw-transport-node-speculos TCP transport.
 *
 * This module provides the `getDeviceInfoDMK` function used by the Guardian
 * demo to print a verified device summary before the three attack scenarios run.
 *
 * DMK classes used:
 *   • ApduBuilder  — builds type-safe APDU command bytes (CLA / INS / P1 / P2 / data)
 *   • ApduParser   — decodes structured fields from raw APDU response bytes
 */

// require() resolves to the CJS conditional export automatically.
// The 'as' cast provides full type safety from the DMK's bundled .d.ts.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { ApduBuilder, ApduParser, ApduResponse } =
  require("@ledgerhq/device-management-kit") as typeof import("@ledgerhq/device-management-kit");
import SpeculosTransport from "@ledgerhq/hw-transport-node-speculos";
import { ethers } from "ethers";
import chalk from "chalk";

const APDU_PORT = parseInt(process.env.SPECULOS_APDU_PORT ?? "9999");

// BIP-44 derivation path: m/44'/60'/0'/0/0
// Each component is a 32-bit big-endian integer; hardened paths have bit 31 set.
const PATH_COMPONENTS = [
  0x8000002c, // 44'
  0x8000003c, // 60'
  0x80000000, // 0'
  0x00000000, // 0
  0x00000000, // 0
];

/**
 * Build a raw Ethereum getAddress APDU using the DMK ApduBuilder.
 *
 * Ethereum app command reference:
 *   CLA  0xE0
 *   INS  0x02  (getAddress)
 *   P1   0x00  (no on-device display)
 *   P2   0x00  (no chaincode)
 *   Data [0x05][path0..4 as 4-byte big-endian each]
 */
function buildGetAddressApdu(): Buffer {
  const builder = new ApduBuilder({ cla: 0xe0, ins: 0x02, p1: 0x00, p2: 0x00 });

  // Number of path components (1 byte)
  builder.add8BitUIntToData(PATH_COMPONENTS.length);

  // Each path component (4 bytes big-endian)
  for (const component of PATH_COMPONENTS) {
    builder.add32BitUIntToData(component);
  }

  const apdu = builder.build();

  // apdu.getRawApdu() returns Uint8Array
  return Buffer.from((apdu as any).getRawApdu?.() ?? apdu);
}

/**
 * Parse the Ethereum getAddress APDU response using the DMK ApduParser.
 *
 * Response layout (no chaincode, no display):
 *   [1B pubkey_len][65B pubkey][1B addr_len][addr_len B address (ASCII)][2B SW]
 *
 * ApduParser takes an ApduResponse{ statusCode, data } — the DMK splits the
 * raw transport bytes into the data payload and the 2-byte status word.
 */
function parseGetAddressResponse(raw: Buffer): { address: string; publicKey: string } {
  // Split: last 2 bytes = SW (status word), rest = data
  const data = new Uint8Array(raw.subarray(0, raw.length - 2));
  const statusCode = new Uint8Array(raw.subarray(raw.length - 2));

  // Wrap in ApduResponse so the DMK parser can consume it
  const apduResponse = new ApduResponse({ statusCode, data });
  const parser = new ApduParser(apduResponse);

  // Public key (length-prefixed)
  const pubKeyLen = parser.extract8BitUInt()!;
  const pubKeyBytes = parser.extractFieldByLength(pubKeyLen)!;
  const publicKey = Buffer.from(pubKeyBytes).toString("hex");

  // Address (length-prefixed ASCII string)
  const addrLen = parser.extract8BitUInt()!;
  const addrBytes = parser.extractFieldByLength(addrLen)!;
  const rawAddress = Buffer.from(addrBytes).toString("ascii");

  // EIP-55 checksum normalisation
  const address = ethers.getAddress(rawAddress.toLowerCase());

  return { address, publicKey };
}

/**
 * Connect to Speculos, issue a DMK-built getAddress APDU, parse the response
 * with the DMK ApduParser, and print a device info summary.
 *
 * Called once at the top of the Guardian demo to prove hardware-in-the-loop
 * and to seed the policy whitelist with the real device address.
 */
export async function getDeviceInfoDMK(): Promise<{ address: string; publicKey: string }> {
  console.log(chalk.cyan("\n[DMK] Building getAddress APDU with @ledgerhq/device-management-kit..."));

  const apduBytes = buildGetAddressApdu();
  console.log(chalk.gray(`[DMK] APDU → ${apduBytes.toString("hex").toUpperCase()}`));

  const transport = await SpeculosTransport.open({ apduPort: APDU_PORT });

  // Exchange raw bytes — the DMK built the command, the transport delivers it
  const responseBuffer = await transport.exchange(apduBytes);
  await transport.close();

  const response = parseGetAddressResponse(Buffer.from(responseBuffer));

  console.log(chalk.green("[DMK] ✓ Response parsed with ApduParser"));
  console.log(chalk.green(`[DMK]   Address    : ${response.address}`));
  console.log(chalk.gray( `[DMK]   Public key : ${response.publicKey.slice(0, 16)}...`));

  return response;
}

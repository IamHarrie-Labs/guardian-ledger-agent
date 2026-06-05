/**
 * spike-signing.ts — Day-1 transport spike
 *
 * PURPOSE: Confirm that Node → hw-transport-node-speculos → Speculos TCP :9999
 * actually works before building anything else.
 *
 * Expected result: Speculos screen shows "Export wallet?" or "Provide public key?"
 * and waits for approve/reject. If you see that, the transport works. Done.
 *
 * Usage:
 *   1. Start Speculos:  speculos path/to/ethereum.elf --model flex
 *   2. In another terminal: npx ts-node src/spike-signing.ts
 */

import "dotenv/config";
import SpeculosTransport from "@ledgerhq/hw-transport-node-speculos";
import Eth from "@ledgerhq/hw-app-eth";
import { listen } from "@ledgerhq/logs";

// Log all APDU traffic so we can see what's happening
listen((log) => console.log("[APDU]", log.type, log.message));

const APDU_PORT = parseInt(process.env.SPECULOS_APDU_PORT ?? "9999");

async function main() {
  console.log(`\nConnecting to Speculos on TCP port ${APDU_PORT}...`);

  let transport;
  try {
    transport = await SpeculosTransport.open({ apduPort: APDU_PORT });
    console.log("✓ Transport open\n");
  } catch (e: any) {
    console.error("✗ Could not connect to Speculos:", e.message);
    console.error("  → Is Speculos running? (speculos ethereum.elf --model flex)");
    process.exit(1);
  }

  const eth = new Eth(transport);

  console.log("Requesting ETH address (verify=true)...");
  console.log("→ CHECK THE SPECULOS SCREEN — it should show an address and ask to approve\n");

  try {
    const result = await eth.getAddress("44'/60'/0'/0/0", true);
    console.log("✓ SPIKE SUCCESS — transport works!");
    console.log("  Address:", result.address);
    console.log("  Public key:", result.publicKey);
  } catch (e: any) {
    console.error("✗ Signing failed:", e.message);
    if (e.statusCode) console.error("  Status code:", "0x" + e.statusCode.toString(16));
  } finally {
    await transport.close();
  }
}

main();

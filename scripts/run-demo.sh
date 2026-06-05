#!/bin/bash
# Run the full three-scene Guardian demo
# Requires Speculos to be running first (scripts/start-speculos.sh in another terminal)

set -e
SCRIPT_DIR="$(dirname "$0")"
ROOT="$SCRIPT_DIR/.."

# Check Speculos is up
if ! curl -sf http://127.0.0.1:5000/events > /dev/null 2>&1; then
  echo "✗ Speculos is not running. Start it first:"
  echo "  bash scripts/start-speculos.sh"
  exit 1
fi

echo "✓ Speculos is running"

# Get the device address first so we can set the whitelist
echo "▶ Getting device address from Speculos..."
cd "$ROOT"
DEVICE_ADDR=$(node -r dotenv/config -e "
const SpeculosTransport = require('@ledgerhq/hw-transport-node-speculos').default;
const Eth = require('@ledgerhq/hw-app-eth').default;
const {ethers} = require('ethers');
(async () => {
  const t = await SpeculosTransport.open({ apduPort: 9999 });
  const eth = new Eth(t);
  const r = await eth.getAddress(\"44'/60'/0'/0/0\", false);
  await t.close();
  console.log(ethers.getAddress(r.address.toLowerCase()));
})().catch(e => { console.error(e.message); process.exit(1); });
" dist/get-address-helper.js 2>/dev/null || node -r dotenv/config -e "
const SpeculosTransport = require('@ledgerhq/hw-transport-node-speculos').default;
const Eth = require('@ledgerhq/hw-app-eth').default;
const {ethers} = require('ethers');
(async () => {
  const t = await SpeculosTransport.open({ apduPort: 9999 });
  const eth = new Eth(t);
  const r = await eth.getAddress(\"44'/60'/0'/0/0\", false);
  await t.close();
  process.stdout.write(ethers.getAddress(r.address.toLowerCase()) + '\n');
})().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
")

echo "✓ Device address: $DEVICE_ADDR"

# Export for demo
export WHITELIST_ADDRESSES="$DEVICE_ADDR"
export MOCK_AGENT="${MOCK_AGENT:-true}"
export SPECULOS_APDU_PORT=9999
export SEPOLIA_RPC_URL="${SEPOLIA_RPC_URL:-https://eth-sepolia.public.blastapi.io}"
export SKIP_BROADCAST="${SKIP_BROADCAST:-true}"

echo "▶ Running Guardian demo..."
echo ""
node dist/demo.js

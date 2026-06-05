#!/bin/bash
# Start Speculos with the Ethereum Flex app
# Uses the standard test mnemonic so the wallet address is deterministic
#
# Device screen visible in Codespaces → forwarded port 5000 → "Open in Browser"
# APDU TCP on port 9999 (consumed by the Node.js agent)

ELF="$(dirname "$0")/../ethereum-flex.elf"

if [ ! -f "$ELF" ]; then
  echo "✗ ethereum-flex.elf not found at $ELF"
  exit 1
fi

echo "▶ Starting Speculos (Ledger Flex, Ethereum app)..."
echo "  Device screen → http://localhost:5000"
echo "  APDU TCP      → localhost:9999"
echo "  Seed          → test test test test test test test test test test test junk"
echo ""

speculos "$ELF" \
  --model flex \
  --display headless \
  --apdu-port 9999 \
  --api-port 5000 \
  --seed "test test test test test test test test test test test junk"

#!/bin/bash
# Codespaces setup — minimal, reliable
set -e

echo "▶ Installing Speculos dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq qemu-user-static

echo "▶ Installing Speculos..."
pip install --quiet speculos

echo "✓ Done: $(speculos --version 2>&1 | head -1)"

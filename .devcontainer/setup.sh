#!/bin/bash
# Codespaces one-time setup — installs Speculos and its Linux deps
set -e

echo "▶ Installing Speculos dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  qemu-user-static \
  python3-pyqt5 \
  libgl1-mesa-glx \
  libglib2.0-0

echo "▶ Installing Speculos..."
pip install --quiet speculos

echo "✓ Speculos ready: $(speculos --version 2>/dev/null || echo 'installed')"
echo "✓ Setup complete"

#!/bin/bash
# Builds BizzyBee-decky.zip in Decky's folder layout.
set -e
cd "$(dirname "$0")"
npm install --no-audit --no-fund && npm run build
rm -rf out && mkdir -p out/BizzyBee
cp -r dist main.py plugin.json package.json README.md out/BizzyBee/
(cd out && zip -qr ../BizzyBee-decky.zip BizzyBee)
echo "Built decky-plugin/BizzyBee-decky.zip"

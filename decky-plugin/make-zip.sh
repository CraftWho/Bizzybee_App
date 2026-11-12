#!/bin/bash
# Builds BizzyBee-decky.zip in Decky's folder layout.
set -e
cd "$(dirname "$0")"
npm install --no-audit --no-fund && npm run build
rm -rf out && mkdir -p out/BizzyBee
node -e "const n=Date.now();const v=require('./package.json').version+'.'+Math.floor(n/60000);require('fs').writeFileSync('build.json',JSON.stringify({version:v,build:Math.floor(n/1000)}))"
cp -r dist main.py build.json plugin.json package.json README.md out/BizzyBee/
(cd out && zip -qr ../BizzyBee-decky.zip BizzyBee)
node -e "const c=require('crypto'),f=require('fs');const b=JSON.parse(f.readFileSync('build.json'));b.sha256=c.createHash('sha256').update(f.readFileSync('BizzyBee-decky.zip')).digest('hex');f.writeFileSync('version.json',JSON.stringify(b))"
echo "Built decky-plugin/BizzyBee-decky.zip"

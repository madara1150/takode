#!/bin/sh
# Builds dist/Takode-macOS.dmg (ad-hoc signed unless a signing identity is configured).
set -e
cd "$(dirname "$0")"
npm install
npm run dist:mac
ls -lh dist/Takode-macOS.dmg

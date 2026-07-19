#!/bin/bash
# Zero-downtime deploy: build to build-next, then atomically swap into place
set -e

echo "Building to build-next/..."
BUILD_PATH=build-next node scripts/build.js

echo "Swapping build/ -> build-prev/, build-next/ -> build/"
if [ -d build ]; then
  rm -rf build-prev || true
  mv build build-prev
fi
mv build-next build
rm -rf build-prev

echo "Deploy complete."

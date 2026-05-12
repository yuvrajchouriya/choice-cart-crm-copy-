// Post-build script: copies the Cloudflare Worker entry + its assets to dist/client/
// so Cloudflare Pages picks up _worker.js and all its dependencies resolve correctly.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";

function copyDir(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Copy the worker entry point to dist/client/_worker.js
const src = "dist/server/index.js";
const dest = "dist/client/_worker.js";

if (!existsSync(src)) {
  console.error(`ERROR: ${src} not found. Did the build succeed?`);
  process.exit(1);
}
copyFileSync(src, dest);
console.log(`✅ Copied ${src} → ${dest}`);

// 2. Merge server assets INTO dist/client/assets/
// _worker.js imports "./assets/worker-entry-*.js" etc. — must be at same level as _worker.js
copyDir("dist/server/assets", "dist/client/assets");
console.log("✅ Merged dist/server/assets → dist/client/assets");


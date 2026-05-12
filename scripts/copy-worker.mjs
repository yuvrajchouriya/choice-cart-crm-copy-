// Post-build script: copies the Cloudflare Worker entry to dist/client/_worker.js
// so Cloudflare Pages picks it up for SSR routing.
import { copyFileSync, existsSync } from "fs";

const src = "dist/server/index.js";
const dest = "dist/client/_worker.js";

if (!existsSync(src)) {
  console.error(`ERROR: ${src} not found. Did the build succeed?`);
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`✅ Copied ${src} → ${dest}`);

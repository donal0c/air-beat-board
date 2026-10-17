// Syntax-check every app module with `node --check`. No bundler, no
// transpiler: if this passes, the browser can parse the same files.

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app.js", "state.js", "actions.js", "history.js", "grooves.js", "storage.js", "audio", "ui"];

function collect(path) {
  if (statSync(path).isDirectory()) {
    return readdirSync(path).flatMap((entry) => collect(join(path, entry)));
  }
  return path.endsWith(".js") ? [path] : [];
}

const files = ROOTS.flatMap(collect);
let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    console.log(`ok   ${file}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${file}\n${error.stderr?.toString() ?? error.message}`);
  }
}
if (failed) {
  console.error(`${failed} file(s) failed to parse`);
  process.exit(1);
}
console.log(`${files.length} files parse`);

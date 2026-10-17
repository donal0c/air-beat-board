// Compare two style snapshots. Prints every element whose computed style
// or box changed, per viewport width. Exits 1 on any difference.
//
//   node scripts/style-diff.mjs before.json after.json

import { readFileSync } from "node:fs";

const [a, b] = process.argv.slice(2).map((file) => JSON.parse(readFileSync(file, "utf8")));
let differences = 0;

for (const width of Object.keys(a)) {
  const before = a[width];
  const after = b[width] ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const x = before[key];
    const y = after[key];
    if (!x || !y) {
      differences += 1;
      console.log(`${width}px  ${x ? "removed" : "added"}  ${key}`);
      continue;
    }
    const rectMoved = x.rect.some((v, i) => Math.abs(v - y.rect[i]) > 0.6);
    // Compare by property name; custom properties (--*) are tokens, not output.
    const toMap = (style) => {
      const map = new Map();
      for (const entry of style.split(";")) {
        const colon = entry.indexOf(":");
        const name = entry.slice(0, colon);
        if (!name.startsWith("--")) map.set(name, entry.slice(colon + 1));
      }
      return map;
    };
    const xm = toMap(x.style);
    const ym = toMap(y.style);
    const changed = [];
    for (const [name, value] of xm) {
      if (ym.get(name) !== value) changed.push(`${name}: ${value} -> ${ym.get(name)}`);
    }
    for (const name of ym.keys()) if (!xm.has(name)) changed.push(`${name}: (new) ${ym.get(name)}`);
    if (changed.length || rectMoved) {
      differences += 1;
      console.log(`${width}px  changed  ${key}${rectMoved ? `  rect ${x.rect} -> ${y.rect}` : ""}`);
      for (const line of changed.slice(0, 6)) console.log(`         ${line}`);
    }
  }
}

console.log(differences ? `${differences} element(s) differ` : "no differences");
process.exit(differences ? 1 : 0);

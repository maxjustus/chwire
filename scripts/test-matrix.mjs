// Run the test suite against multiple ClickHouse versions sequentially.
// Usage: npm run test:matrix            (defaults below)
//        CH_VERSIONS="24.8 25.8 26.4" npm run test:matrix
import { spawnSync } from "node:child_process";

const versions = (process.env.CH_VERSIONS ?? "25.8 26.4").split(/[\s,]+/).filter(Boolean);
const failed = [];

for (const version of versions) {
  console.log(`\n=== ClickHouse ${version} ===`);
  const result = spawnSync("npm", ["test"], {
    stdio: "inherit",
    env: { ...process.env, CH_VERSION: version },
  });
  if (result.status !== 0) failed.push(version);
}

console.log(
  `\n=== Matrix summary: ${versions.length - failed.length}/${versions.length} passed ===`,
);
if (failed.length > 0) {
  console.error(`Failed versions: ${failed.join(", ")}`);
  process.exit(1);
}

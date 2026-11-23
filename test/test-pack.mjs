import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), "chwire-pack-"));

try {
  const [{ filename }] = JSON.parse(
    execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", consumer], {
      cwd: packageRoot,
      encoding: "utf8",
    }),
  );

  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true }));
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(consumer, filename)],
    { cwd: consumer, stdio: "inherit" },
  );

  // Use the project's TS loader; Node does not strip types in node_modules.
  const smoke = join(consumer, "smoke.mts");
  writeFileSync(
    smoke,
    'import { query } from "@maxjustus/chwire/source";\n' +
      'if (typeof query !== "function") throw new Error("Source export is missing query");\n',
  );
  execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), smoke], {
    cwd: consumer,
    stdio: "inherit",
  });
  console.log("Packed source export PASSED!");
} finally {
  rmSync(consumer, { recursive: true, force: true });
}

// Wrapper for ch-city-wasm that works both bundled (esbuild) and unbundled (Node.js)
// When bundled: esbuild picks the default export from ch-city-wasm package (ch_city_wasm.js)
//               which exports initSync, so we initialize with inline wasm
// When unbundled: Node.js picks the node export (node.js) which auto-initializes
//                 and initSync is not exported (already initialized)

import * as cityWasm from "ch-city-wasm";
import getWasm from "ch-city-wasm/wasm";

// Variable indirection prevents esbuild's import-is-undefined warning.
// esbuild only warns on direct namespace property access (cityWasm.initSync),
// not on property access through an intermediate variable.
const _mod = cityWasm;
if (typeof _mod.initSync === "function") {
  _mod.initSync({ module: getWasm() });
}

export const cityhash_102_128 = cityWasm.cityhash_102_128;

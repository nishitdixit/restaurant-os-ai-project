import { defineConfig } from "tsup";

// Bundles the API and worker; workspace packages (TypeScript sources) are inlined, npm dependencies stay external.
export default defineConfig({
  entry: { main: "src/main.ts", worker: "src/worker.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/^@restaurant-os\//],
});

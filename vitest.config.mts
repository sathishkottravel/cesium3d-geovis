import { defineConfig } from "vitest/config";

// Tests run in Node; browser globals (window, navigator, fetch) are stubbed per test.
// - unit:  fast, no WASM binaries or network
// - wasm:  loads the real modules from public/wasm (slower, several MB each)
export default defineConfig({
  test: {
    unstubEnvs: true,
    unstubGlobals: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "tests/config/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "wasm",
          environment: "node",
          include: ["tests/wasm/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: [
            "src/main/**/*.test.ts",
            "src/renderer/src/canvas/core/**/*.test.ts",
            "src/renderer/src/canvas/view/**/*.test.ts",
            "src/renderer/src/designer/**/*.test.ts",
            "src/renderer/src/presets/**/*.test.ts",
            "src/renderer/src/providers/**/*.test.ts",
            "src/renderer/src/workbench/**/*.test.ts",
        ],
        testTimeout: 15_000,
    },
});

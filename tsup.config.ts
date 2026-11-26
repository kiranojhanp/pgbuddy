import { defineConfig } from "tsup";
import tsconfig from "./tsconfig.json";

export default defineConfig((options) => ({
  entry: {
    index: "src/index.ts",
    "adapters/valibot": "src/adapters/valibot.ts",
    "adapters/yup": "src/adapters/yup.ts",
  },
  dts: true,
  outDir: "dist",
  format: ["cjs", "esm"],
  name: "pgbuddy",
  outExtension({ format }) {
    return {
      js: `.${format}.js`,
    };
  },
  sourcemap: false,
  clean: true,
  target: tsconfig.compilerOptions.target as "ES2016",
  minify: !options.watch,
}));

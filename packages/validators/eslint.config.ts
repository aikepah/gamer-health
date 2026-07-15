import { defineConfig } from "eslint/config";

import { baseConfig } from "@gamer-health/eslint-config/base";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
);

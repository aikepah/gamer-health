import { defineConfig } from "eslint/config";

import { baseConfig } from "@gamer-health/eslint-config/base";
import { reactConfig } from "@gamer-health/eslint-config/react";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  reactConfig,
);

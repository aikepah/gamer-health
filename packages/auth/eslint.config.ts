import { defineConfig } from "eslint/config";

import {
  baseConfig,
  restrictEnvAccess,
} from "@gamer-health/eslint-config/base";

export default defineConfig(
  {
    ignores: ["script/**"],
  },
  baseConfig,
  restrictEnvAccess,
);

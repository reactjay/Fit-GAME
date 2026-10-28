import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Pages load data in effects and set state when the request resolves (plus a
      // synchronous "loading/error reset" before it). That's intentional here.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // The 3D game mutates three.js engine objects (textures, materials, meshes) and
    // per-frame state in refs/singletons by design; these React-state rules don't apply.
    files: ["src/game/**"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored third-party decoders (Draco).
    "public/**",
  ]),
]);

export default eslintConfig;

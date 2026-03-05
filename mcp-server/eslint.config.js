import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      // Catch magic numbers — forces extraction to named constants
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: [0, 1, -1],
          enforceConst: true,
          ignoreArrayIndexes: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreTypeIndexes: true,
          ignoreReadonlyClassProperties: true,
        },
      ],
      // Catch empty catch blocks (no-op error swallowing)
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  // Relax magic numbers in test files — tests naturally use literal values
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "vitest.config.ts", "eslint.config.js"],
  }
);

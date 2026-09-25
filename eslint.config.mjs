// Tek ESLint yapılandırması: tüm paket ve uygulamalar bunu kullanır.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/src/generated/**",
      "**/next-env.d.ts",
      "apps/mobile/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // NestJS DI, parametre tiplerini decorator metadata ile çözer; type-only import bu bilgiyi siler.
    files: ["apps/api/**/*.ts"],
    rules: { "@typescript-eslint/consistent-type-imports": "off" },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts", "**/prisma/seed.ts", "scripts/**"],
    rules: { "no-console": "off" },
  },
  prettier,
);

// @ts-check

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "*.ehpk",
      ".specify/scripts/**", // shell scripts shipped by spec-kit
      ".specify/templates/**",
      "specs/*/artifacts/**", // screenshot fixtures, not code
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser / WebView runtime globals used by the SDK and our code.
        window: "readonly",
        document: "readonly",
        console: "readonly",
        crypto: "readonly",
        indexedDB: "readonly",
        IDBDatabase: "readonly",
        IDBObjectStore: "readonly",
        IDBRequest: "readonly",
        URLSearchParams: "readonly",
        File: "readonly",
        DOMParser: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        Blob: "readonly",
        HTMLElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLLIElement: "readonly",
        HTMLUListElement: "readonly",
        Document: "readonly",
        Element: "readonly",
        Node: "readonly",
        performance: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        // Node globals used by tests
        process: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);

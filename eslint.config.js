import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.min.js",
      "**/package-lock.json",
    ],
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        PIXI: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        requestAnimationFrame: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        global: "readonly",
      },
    },
    rules: {
      indent: ["error", 2],
      "linebreak-style": ["error", "unix"],
      quotes: ["error", "single"],
      semi: ["error", "always"],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn"],
      "no-undef": "error",
    },
  },
];

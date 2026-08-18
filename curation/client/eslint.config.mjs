import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),

  // Next.js 기본 (core-web-vitals + typescript)
  ...nextVitals,
  ...nextTs,

  // 타입 기반 엄격 규칙 (진짜 버그를 잡는 핵심)
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      // ── import: 자동 정렬 + 미사용 자동 제거 (비개발자용 auto-fix) ──
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // ── 안전·명확성 (실수 차단) ──
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // ── 과하게 시끄러운 것은 경고로 완화 (에러만 커밋 차단) ──
      "@typescript-eslint/restrict-template-expressions": [
        "warn",
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },

  // 설정/스크립트 파일은 타입 기반 검사 제외
  {
    files: ["**/*.mjs", "**/*.config.*"],
    ...tseslint.configs.disableTypeChecked,
  },

  // prettier와 충돌하는 포맷 규칙 끄기 — 반드시 마지막
  prettier,
]);

export default eslintConfig;

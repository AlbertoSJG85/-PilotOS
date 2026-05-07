import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // setLoading(true) at the top of useEffect is a common valid pattern.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['src/app/**/*.tsx', 'src/components/**/*.tsx'],
    rules: {
      // UI pages use `any` for catch params and form state; tracked as technical debt.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]);

export default eslintConfig;

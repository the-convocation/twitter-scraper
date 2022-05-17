import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

export default [
  {
    input: './src/scraper.ts',
    output: {
      dir: 'dist',
      format: 'cjs',
    },
    plugins: [
      typescript({
        exclude: ['**/__tests__', '**/*.test.ts'],
      }),
    ],
  },
  {
    input: './dist/types/scraper.d.ts',
    output: {
      file: './dist/scraper.d.ts',
      format: 'cjs',
    },
    plugins: [dts()],
  },
];

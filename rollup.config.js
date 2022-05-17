import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/scraper.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
  },
  plugins: [
    typescript({
      exclude: ['**/__tests__', '**/*.test.ts'],
    }),
  ],
};

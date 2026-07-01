import terser from '@rollup/plugin-terser';
import pkg from './package.json' with { type: 'json' };

const banner = `/* Loady v${pkg.version} — FOUC-free CDN page loader — https://github.com/szsoma/loady */`;

export default [
  {
    input: 'src/loady.js',
    output: {
      file: 'dist/loady.js',
      format: 'iife',
      name: 'Loady',
      banner,
    },
    plugins: [],
  },
  {
    input: 'src/loady.js',
    output: {
      file: 'dist/loady.min.js',
      format: 'iife',
      name: 'Loady',
      banner,
    },
    plugins: [terser({ format: { comments: /Loady v/ } })],
  },
  {
    input: 'src/loady.js',
    output: {
      file: 'dist/loady.esm.js',
      format: 'esm',
      banner,
    },
    plugins: [],
  },
  {
    input: 'src/loady.js',
    output: {
      file: 'dist/loady.esm.min.js',
      format: 'esm',
      banner,
    },
    plugins: [terser({ format: { comments: /Loady v/ } })],
  },
];

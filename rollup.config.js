import terser from '@rollup/plugin-terser';

export default [
  {
    input: 'src/loady.js',
    output: {
      file: 'dist/loady.js',
      format: 'iife',
      name: 'Loady',
    },
    plugins: [],
  },
  {
    input: 'src/loady.js',
    output: {
      file: 'dist/loady.min.js',
      format: 'iife',
      name: 'Loady',
    },
    plugins: [terser()],
  },
  {
    input: 'src/loady.js',
    output: {
      file: 'dist/loady.esm.js',
      format: 'esm',
    },
    plugins: [],
  },
  {
    input: 'src/loady.js',
    output: {
      file: 'dist/loady.esm.min.js',
      format: 'esm',
    },
    plugins: [terser()],
  },
];

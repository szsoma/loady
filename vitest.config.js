import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['.worktrees/**', '.opencode/**', 'node_modules/**'],
  },
});

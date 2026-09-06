import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // The shared event catalog lives one level above the frontend root.
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:5000' },
  },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

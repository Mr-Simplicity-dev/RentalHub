import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const clientEnv = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const define = Object.fromEntries(
    Object.entries(clientEnv).map(([key, value]) => [
      `process.env.${key}`,
      JSON.stringify(value),
    ]),
  );

  define['process.env.TURN_URL'] = 'undefined';
  define['process.env.TURN_USERNAME'] = 'undefined';
  define['process.env.TURN_PASSWORD'] = 'undefined';

  return {
    plugins: [tailwindcss(), react()],
    define,
    envPrefix: ['VITE_', 'REACT_APP_'],
    build: {
      outDir: 'build',
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.js',
    },
  };
});
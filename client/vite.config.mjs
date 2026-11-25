import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import apiBaseUrlConfig from './config/apiBaseUrl.cjs';

export default defineConfig(({ mode, command }) => {
  const clientEnv = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const define = Object.fromEntries(
    Object.entries(clientEnv).map(([key, value]) => [
      `process.env.${key}`,
      JSON.stringify(value),
    ]),
  );

  define['process.env.REACT_APP_API_URL'] = JSON.stringify(
    apiBaseUrlConfig.resolveApiBaseUrl(clientEnv.REACT_APP_API_URL, { production: command === 'build' }),
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
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
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
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = __dirname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  return {
    root: path.resolve(repoRoot, 'Frontend'),
    envDir: repoRoot,
    publicDir: path.resolve(__dirname, 'Frontend', 'public'),
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'Frontend', 'src'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'Frontend', 'dist'),
      emptyOutDir: true,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      // When frontend runs on another port (e.g. 3001), proxy /api to the backend (default 3000).
      proxy: {
        '/api': {
          target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});

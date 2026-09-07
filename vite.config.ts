import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? process.env.PAGES_BASE_PATH || '/shanhe/' : '/',
  plugins: [react()],
  server: { port: 5178, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4310' } },
  build: {
    outDir: mode === 'pages' ? 'dist-pages' : 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { map: ['maplibre-gl'] } } },
  },
}));

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'GCITiresWidget',
      fileName: 'tirebot-widget',
      formats: ['iife'],
    },
    rollupOptions: {
      // Inline all dependencies — self-contained bundle for Shopify
      external: [],
      output: {
        // Global name for IIFE
        name: 'GCITiresWidget',
        // Inline CSS into JS to keep single-file embed
        inlineDynamicImports: true,
      },
    },
    // Target modern browsers (Shopify stores don't support IE)
    target: 'es2018',
    // Minify for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // keep for debugging; set true in final prod
        passes: 2,
      },
    },
    // Report bundle size
    reportCompressedSize: true,
    // CSS injected via JS (single file)
    cssCodeSplit: false,
  },
  define: {
    // Replace process.env in widget code
    'process.env.NODE_ENV': '"production"',
  },
});

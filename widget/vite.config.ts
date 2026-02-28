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
      external: [],
      output: {
        name: 'GCITiresWidget',
        inlineDynamicImports: true,
      },
    },
    target: 'es2018',
    minify: 'esbuild',
    reportCompressedSize: true,
    cssCodeSplit: false,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

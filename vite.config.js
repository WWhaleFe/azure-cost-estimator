import { defineConfig } from 'vite';

// base: './' — GitHub Pages 서브패스(/azure-cost-estimator/)와 Vercel 루트 양쪽에서
// 동작하도록 상대 경로로 자산을 참조한다.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: false,
  },
});

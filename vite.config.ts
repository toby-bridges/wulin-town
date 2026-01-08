import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/wulin-town',
  plugins: [react()],
  server: {
    allowedHosts: ['wulin-town.fly.dev', 'localhost', '127.0.0.1'],
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // During "npm run dev", send /api calls to the backend on your laptop
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});

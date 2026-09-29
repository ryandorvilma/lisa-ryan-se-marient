// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    server: {
      // En dev, le backend RSVP/admin (Node/Express) tourne sur :8787 (voir /server).
      // En prod, Nginx route /api et /admin vers le même processus Node — voir server/README.md.
      proxy: {
        '/api': 'http://localhost:8787',
        '/admin': 'http://localhost:8787',
      },
    },
  },
});

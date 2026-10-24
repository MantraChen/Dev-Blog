import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://howielog.com',
  output: 'server',
  compressHTML: true,
  security: {
    checkOrigin: false,
  },
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});

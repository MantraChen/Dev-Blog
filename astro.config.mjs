import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://howielog.com',
  output: 'server',
  compressHTML: true,
  security: {
    checkOrigin: true,
    allowedDomains: [
      { protocol: 'https', hostname: 'howielog.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
  server: { host: '127.0.0.1' },
  adapter: node({
    mode: 'standalone',
    bodySizeLimit: 1024 * 1024,
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});

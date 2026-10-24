import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://howielog.com',
  output: 'server',
  compressHTML: true,
  markdown: { syntaxHighlight: false }, // Application Markdown uses sanitized highlight.js output.
  security: {
    checkOrigin: true,
    csp: {
      scriptDirective: { resources: ["'self'", 'https://giscus.app'] },
      // KaTeX, reading progress and React components use style attributes.
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
      directives: ["default-src 'self'", "img-src 'self' data: https:",
        "font-src 'self' data:", "connect-src 'self'",
        'frame-src https://giscus.app', "object-src 'none'", "base-uri 'self'", "form-action 'self'"],
    },
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

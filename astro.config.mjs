import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import node from '@astrojs/node';

const siteUrl = new URL(process.env.SITE_URL || 'https://howielog.com');
if (!['https:', 'http:'].includes(siteUrl.protocol) || siteUrl.username || siteUrl.password ||
    siteUrl.pathname !== '/' || siteUrl.search || siteUrl.hash) {
  throw new Error('SITE_URL must be an http(s) origin without a path or credentials');
}
const base = (process.env.PUBLIC_BASE_PATH || '/').replace(/\/+$/, '') || '/';
if (base !== '/' && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(base)) {
  throw new Error('PUBLIC_BASE_PATH must be an absolute path of simple segments');
}

export default defineConfig({
  site: siteUrl.origin,
  base,
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
      { protocol: siteUrl.protocol.slice(0, -1), hostname: siteUrl.hostname, ...(siteUrl.port ? { port: siteUrl.port } : {}) },
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

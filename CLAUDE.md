# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev       # Start dev server at localhost:4321
npm run build     # Build production site to ./dist/
npm run preview   # Preview production build locally
npm run astro ... # Run Astro CLI commands
```

## Architecture

This is an Astro 6 SSR blog with server-side rendering via the Node.js standalone adapter. Key tech:

- **Astro** (`output: 'server'`) — all pages are server-rendered by default; use `export const prerender = true` on individual pages to opt into static generation
- **React** — available for interactive components via `@astrojs/react`
- **Tailwind CSS** — utility-first styling via `@astrojs/tailwind`
- **Drizzle ORM + better-sqlite3** — database layer (schema and migrations managed with `drizzle-kit`)

Pages live in `src/pages/` and are file-system routed. Components go in `src/components/`. Static assets go in `public/`.

No lint or test scripts are configured yet.

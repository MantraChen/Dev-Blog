# HowieSun - Personal Blog

A personal technical blog built with Astro 6 SSR, deployed on Windows Server 2022 with Caddy reverse proxy.

## Tech Stack

- **Framework**: Astro 6 SSR + Node.js standalone adapter
- **Database**: SQLite (better-sqlite3) + Drizzle ORM
- **Styling**: Tailwind CSS v4 + custom design tokens
- **Content**: Markdown blog posts stored in SQLite, rendered server-side via `marked` with highlight.js code highlighting and KaTeX math rendering
- **Islands**: React 19 (minimal client JS — TagFilter with search, ThemeToggle, AdminApp)
- **Comments**: Giscus (GitHub Discussions) with automatic dark/light theme sync
- **Deployment**: Windows Server 2022 + Caddy (auto HTTPS) + NSSM (service manager)

## Features

### Blog
- Full admin CRUD with markdown editor and live preview
- Code syntax highlighting (highlight.js, github-dark theme)
- Math formula rendering (KaTeX, inline `$...$` and block `$$...$$`)
- Full-text search with 300ms debounce
- Tag-based filtering
- View count tracking per post
- Emoji reactions per post
- Previous/next post navigation
- Reading progress bar and TOC sidebar (desktop sidebar + mobile drawer)
- Giscus comment system with theme sync via MutationObserver
- Archive page (posts grouped by year/month)
- **Hidden posts**: unlisted from all listings (blog, archive, search, RSS, sitemap) but accessible via direct link
- **404 redirect**: invalid blog slugs redirect to the 404 page

### Content Management
- **Project showcase, skills overview, career timeline, blogroll (friends)** — all backed by SQLite
- **Admin panel**: Session-based auth (bcrypt + HttpOnly cookies), 7 tabs — Blog, Projects, Statuses, Skills, Timeline, Friends, Stats
- **Blog status cycle**: Draft (yellow) → Published (green) → Hidden (purple) — single-click toggle in admin
- **Stats dashboard**: Total views, top posts ranking, daily views bar chart (last 30 days)

### UI & Responsive
- Fully responsive mobile-first design with Tailwind CSS breakpoints
- Mobile hamburger menu with smooth slide-down animation and outside-click-to-close
- Dynamic favicon that follows dark/light theme switching
- Smooth theme transition animation (optimized for performance — transitions only on key layout elements)
- Interactive 404 page with canvas black hole animation (cursor-following, debris spaghettification, dodge button easter egg)
- Hero entrance animations, scroll reveal effects, View Transitions
- Skills page with auto-width labels (no truncation regardless of name length)

### Security
- Caddy reverse proxy with security response headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- Input validation on all API routes via Zod schemas
- Login rate limiting (5 attempts per 15 minutes per IP)
- Public API rate limiting (60 requests per minute per IP)
- Request body size limit (1MB)
- Audit logging on all admin operations (create/update/delete + login/logout events)
- Secure HttpOnly session cookies with SameSite=Strict and 7-day expiry
- Markdown raw HTML sanitization to prevent XSS
- Strict ID parameter parsing on all API routes
- Cache-Control: no-store on all authenticated API responses
- SQLite database not accessible via HTTP
- Git history cleaned of sensitive files (database, credentials)
- Windows Server hardened: non-standard RDP port, account lockout policy, unnecessary services disabled, firewall restricted to 80/443/RDP only

### Performance & SEO
- SSR cache headers on all public pages (Cache-Control + stale-while-revalidate)
- RSS feed, sitemap, SEO meta/OG tags
- Dark mode with smooth transition, View Transitions, scroll reveal animations
- Automatic DB schema migration on deploy via drizzle-kit push

## Project Structure

```
src/
  components/
    layout/              # BaseLayout, Nav (with mobile hamburger menu)
    blog/                # TagFilter with search, ReactionBar (React islands)
    admin/               # AdminApp (React island, tab router)
      panels/            # BlogPanel, ProjectsPanel, StatusesPanel, SkillsPanel, TimelinePanel, FriendsPanel, StatsPanel
    ThemeToggle.tsx       # Dark/light mode toggle with smooth transition
  db/
    schema.ts            # Drizzle schema (posts, postViews, projects, statuses, skills, timeline, friends, reactions, adminSessions, auditLogs)
    queries.ts           # Database queries (CRUD, search, view counts, reactions, stats, audit logs)
    types.ts             # TypeScript interfaces
  pages/
    api/                 # REST API routes (auth, posts, posts/search, posts/views, projects, statuses, skills, timeline, friends, reactions, stats)
    blog/                # Blog list + [slug] detail
    projects/            # Project showcase
    admin/               # Login + admin panel
    skills.astro         # Skills/tech stack (auto-width labels)
    timeline.astro       # Career timeline
    archive.astro        # Posts archive by year/month
    friends.astro        # Blogroll / friend links
    404.astro            # Interactive black hole 404 page
    rss.xml.ts           # RSS feed
    sitemap.xml.ts       # Dynamic sitemap
  lib/
    auth.ts              # Session management, rate limiting, IP extraction
    markdown.ts          # Configured marked renderer (highlight.js + KaTeX + heading IDs + GFM + HTML sanitization)
    validation.ts        # Zod schemas for API input validation + safe body parser
    utils.ts             # cn() helper
  middleware.ts          # Security headers, public API rate limiting, body size limit
  styles/globals.css     # Tailwind + CSS custom properties + mobile prose adjustments + theme transition
```

## Deployment

Deployed on Windows Server 2022 Datacenter (2C2G) with:

- **Node.js 22 LTS** running `dist/server/entry.mjs`
- **NSSM** registering Node as a Windows service (auto-restart, boot start)
- **Caddy** as reverse proxy (auto HTTPS via Let's Encrypt, security headers)
- **Firewall**: only ports 80, 443, and custom RDP port open
- **Auto-deploy**: GitHub webhook triggers `git pull` + `npm install` + `npm run build` + `drizzle-kit push` + service restart

### Deploy / Update

```powershell
cd C:\sites\dev-blog
git pull
npm install
npx drizzle-kit push --force
npm run build
nssm restart dev-blog
```

## Commands

| Command                      | Action                                     |
| :--------------------------- | :----------------------------------------- |
| `npm install`                | Install dependencies                       |
| `npm run dev`                | Start dev server at `localhost:4321`       |
| `npm run build`              | Build production site to `./dist/`         |
| `npm run preview`            | Preview production build locally           |
| `npx drizzle-kit push`       | Push schema changes to SQLite DB           |
| `npx drizzle-kit studio`     | Visual DB explorer                         |

## Environment Variables

```env
ADMIN_PASSWORD_HASH=<bcrypt hash for admin login>
```

Generate a hash: `node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"`

## License

[MIT](LICENSE)

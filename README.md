# Mantra Chen - Personal Tech Blog

A personal technical blog built with Astro 6 SSR, showcasing projects in concurrent data structures, spatial indexing, and systems programming.

## Tech Stack

- **Framework**: Astro 6 SSR + Node.js standalone adapter
- **Database**: SQLite (better-sqlite3) + Drizzle ORM
- **Styling**: Tailwind CSS v4 + custom design tokens
- **Content**: Markdown blog posts stored in SQLite, rendered server-side via `marked` with highlight.js code highlighting and KaTeX math rendering
- **Islands**: React 19 (minimal client JS — TagFilter with search, ThemeToggle, AdminApp)
- **Comments**: Giscus (GitHub Discussions)

## Features

### Blog
- Full admin CRUD with markdown editor and live preview
- Code syntax highlighting (highlight.js, github-dark theme)
- Math formula rendering (KaTeX, inline `$...$` and block `$$...$$`)
- Full-text search with 300ms debounce
- Tag-based filtering
- View count tracking per post
- Emoji reactions per post (👍 🎉 ❤️ 🚀 👀 🤔)
- Previous/next post navigation
- Reading progress bar and TOC sidebar
- Giscus comment system
- Archive page (posts grouped by year/month)

### Content Management
- **Project showcase, skills overview, career timeline, blogroll (friends)** — all backed by SQLite
- **Admin panel**: Session-based auth (bcrypt + HttpOnly cookies), 7 tabs — Blog, Projects, Statuses, Skills, Timeline, Friends, Stats
- **Stats dashboard**: Total views, top posts ranking, daily views bar chart (last 30 days)

### Security
- Login rate limiting (5 attempts per 15 minutes per IP)
- Audit logging on all admin operations (create/update/delete + login events)
- HttpOnly session cookies with 7-day expiry

### Performance & SEO
- SSR cache headers on all public pages (Cache-Control + stale-while-revalidate)
- RSS feed, sitemap, SEO meta/OG tags
- Dark mode, View Transitions, scroll reveal animations

## Project Structure

```
src/
  components/
    layout/              # BaseLayout, Nav
    blog/                # TagFilter with search, ReactionBar (React islands)
    admin/               # AdminApp (React island, 7 tabs)
    ThemeToggle.tsx       # Dark/light mode toggle
  db/
    schema.ts            # Drizzle schema (posts, postViews, projects, statuses, skills, timeline, friends, reactions, adminSessions, auditLogs)
    queries.ts           # Database queries (CRUD, search, view counts, reactions, stats, audit logs)
    types.ts             # TypeScript interfaces
  pages/
    api/                 # REST API routes (auth, posts, posts/search, posts/views, projects, statuses, skills, timeline, friends, reactions, stats)
    blog/                # Blog list + [slug] detail
    projects/            # Project showcase
    admin/               # Login + admin panel
    skills.astro         # Skills/tech stack
    timeline.astro       # Career timeline
    archive.astro        # Posts archive by year/month
    friends.astro        # Blogroll / friend links
    rss.xml.ts           # RSS feed
    sitemap.xml.ts       # Dynamic sitemap
  lib/
    auth.ts              # Session management, rate limiting, IP extraction
    markdown.ts          # Configured marked renderer (highlight.js + KaTeX + heading IDs + GFM)
    utils.ts             # cn() helper
  styles/globals.css     # Tailwind + CSS custom properties
```

## Commands

| Command           | Action                                     |
| :---------------- | :----------------------------------------- |
| `npm install`     | Install dependencies                       |
| `npm run dev`     | Start dev server at `localhost:4321`       |
| `npm run build`   | Build production site to `./dist/`         |
| `npm run preview` | Preview production build locally           |

## Environment Variables

```env
ADMIN_PASSWORD_HASH=<bcrypt hash for admin login>
```

Generate a hash: `node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"`

## License

[MIT](LICENSE)

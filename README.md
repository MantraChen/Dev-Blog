# Mantra Chen - Personal Tech Blog

A personal technical blog built with Astro 6 SSR, showcasing projects in concurrent data structures, spatial indexing, and systems programming.

## Tech Stack

- **Framework**: Astro 6 SSR + Node.js standalone adapter
- **Database**: SQLite (better-sqlite3) + Drizzle ORM
- **Styling**: Tailwind CSS v4 + shadcn/ui design system
- **Content**: Markdown blog posts stored in SQLite, rendered server-side via `marked`. KaTeX math support via remark-math/rehype-katex for MDX content.
- **Islands**: React 19 (minimal client JS — only TagFilter, ThemeToggle, AdminApp)

## Features

- **Blog**: Full admin CRUD, markdown editor with live preview, code highlighting, math formulas (KaTeX), reading progress bar, TOC sidebar
- **Interactive MDX components**: `<SpatialTree />` and `<MemoryLayout />` for technical deep-dives (via Astro Content Collections)
- **Project showcase, skills overview, career timeline** — all backed by SQLite
- **Admin panel**: Session-based auth (bcrypt + HttpOnly cookies), 5 tabs — Blog, Projects, Statuses, Skills, Timeline
- **RSS feed, sitemap, SEO** meta/OG tags
- **Dark mode**, View Transitions, scroll reveal animations
- **SSR cache headers** on static-ish pages (skills, timeline, projects, blog posts)

## Project Structure

```
src/
  content/blog/          # MDX posts with interactive components (optional)
  components/
    layout/              # BaseLayout, Nav
    blog/                # TagFilter (React island)
    mdx/                 # SpatialTree, MemoryLayout (React islands)
    admin/               # AdminApp (React island)
  db/
    schema.ts            # Drizzle schema (posts, projects, statuses, skills, timeline, admin_sessions)
    queries.ts           # Database queries
  pages/
    api/                 # REST API routes (auth, posts, projects, statuses, skills, timeline)
    blog/                # Blog list + [slug] detail
    projects/            # Project showcase
    admin/               # Login + admin panel
    skills.astro         # Skills/tech stack
    timeline.astro       # Career timeline
    rss.xml.ts           # RSS feed
  lib/
    auth.ts              # Session management
    markdown.ts          # Configured marked renderer (heading IDs, GFM)
    utils.ts             # cn() helper
  styles/globals.css     # Tailwind + shadcn/ui CSS variables
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

ALTER TABLE posts ADD COLUMN deletedAt TEXT;
ALTER TABLE posts ADD COLUMN seriesOrder INTEGER NOT NULL DEFAULT 0;
CREATE INDEX posts_active ON posts(deletedAt, draft, hidden, publishedAt);
CREATE TABLE post_aliases (slug TEXT PRIMARY KEY, postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE);
CREATE TABLE post_links (postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, targetSlug TEXT NOT NULL, PRIMARY KEY(postId,targetSlug));
CREATE INDEX post_links_target ON post_links(targetSlug,postId);
CREATE TABLE series (slug TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '');
INSERT INTO series(slug,title) SELECT DISTINCT series,series FROM posts WHERE series IS NOT NULL AND series!='';
CREATE TABLE post_schedules (
  draftId TEXT PRIMARY KEY REFERENCES post_drafts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, scheduledAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', error TEXT
);
CREATE INDEX schedules_due ON post_schedules(status,scheduledAt);
CREATE TABLE site_content (key TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', updatedAt TEXT NOT NULL);
INSERT INTO site_content VALUES ('now','',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
ALTER TABLE projects ADD COLUMN slug TEXT;
ALTER TABLE projects ADD COLUMN content TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN completedAt TEXT;
UPDATE projects SET slug='project-'||id;
CREATE UNIQUE INDEX projects_slug ON projects(slug);

ALTER TABLE posts ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE post_drafts (
  id TEXT PRIMARY KEY,
  postId INTEGER UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  baseVersion INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE post_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  savedAt TEXT NOT NULL,
  UNIQUE(postId, version)
);
CREATE INDEX post_revisions_post ON post_revisions(postId, id DESC);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE post_media (
  postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  mediaId TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  PRIMARY KEY(postId, mediaId)
);
CREATE INDEX media_recent ON media(createdAt DESC, id DESC);
CREATE INDEX post_media_asset ON post_media(mediaId, postId);

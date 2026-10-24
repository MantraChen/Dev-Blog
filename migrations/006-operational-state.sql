CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO app_settings VALUES('visitor_secret', lower(hex(randomblob(32))));
CREATE TABLE rate_limits (
  namespace TEXT NOT NULL, key TEXT NOT NULL, count INTEGER NOT NULL,
  expires INTEGER NOT NULL, PRIMARY KEY(namespace,key)
);
CREATE INDEX rate_limits_expiry ON rate_limits(expires);
CREATE TABLE post_view_daily (
  postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  day TEXT NOT NULL, views INTEGER NOT NULL, PRIMARY KEY(postId,day)
);
INSERT INTO post_view_daily SELECT postId, COALESCE(date(createdAt),'unknown'), count(*)
  FROM post_views WHERE postId IS NOT NULL GROUP BY postId, COALESCE(date(createdAt),'unknown');
CREATE TRIGGER post_view_rollup AFTER INSERT ON post_views WHEN new.postId IS NOT NULL BEGIN
  INSERT INTO post_view_daily(postId,day,views) VALUES(new.postId,COALESCE(date(new.createdAt),'unknown'),1)
    ON CONFLICT(postId,day) DO UPDATE SET views=views+1;
END;
ALTER TABLE reactions ADD COLUMN visitorKey TEXT;
CREATE UNIQUE INDEX reactions_visitor ON reactions(postId,emoji,visitorKey);
CREATE TABLE reaction_totals (
  postId INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(postId,emoji)
);
INSERT INTO reaction_totals SELECT postId,emoji,count(*) FROM reactions WHERE postId IS NOT NULL GROUP BY postId,emoji;
CREATE TRIGGER reaction_rollup AFTER INSERT ON reactions WHEN new.postId IS NOT NULL BEGIN
  INSERT INTO reaction_totals(postId,emoji,count) VALUES(new.postId,new.emoji,1)
    ON CONFLICT(postId,emoji) DO UPDATE SET count=count+1;
END;
CREATE INDEX reactions_created ON reactions(createdAt);
CREATE INDEX audit_logs_created ON audit_logs(createdAt);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expiresAt);
CREATE INDEX post_view_daily_day ON post_view_daily(day);

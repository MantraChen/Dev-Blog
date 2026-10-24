CREATE VIRTUAL TABLE posts_search USING fts5(title, description, content,
  content='posts', content_rowid='id', tokenize='trigram');
CREATE TRIGGER posts_search_insert AFTER INSERT ON posts BEGIN
  INSERT INTO posts_search(rowid,title,description,content) VALUES(new.id,new.title,new.description,new.content);
END;
CREATE TRIGGER posts_search_delete AFTER DELETE ON posts BEGIN
  INSERT INTO posts_search(posts_search,rowid,title,description,content) VALUES('delete',old.id,old.title,old.description,old.content);
END;
CREATE TRIGGER posts_search_update AFTER UPDATE OF title,description,content ON posts BEGIN
  INSERT INTO posts_search(posts_search,rowid,title,description,content) VALUES('delete',old.id,old.title,old.description,old.content);
  INSERT INTO posts_search(rowid,title,description,content) VALUES(new.id,new.title,new.description,new.content);
END;
INSERT INTO posts_search(posts_search) VALUES('rebuild');

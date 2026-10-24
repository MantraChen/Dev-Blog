import type Database from "better-sqlite3";
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";

export type SearchOptions = {
  query: string;
  tag: string;
  page?: number;
  year?: string;
  series?: string;
};
type SearchPage = {
  ids: number[];
  total: number;
  page: number;
  pageSize: number;
};

// Kept self-contained so exactly the same query runs in tests and the worker.
export function executeSearch(
  database: Database.Database,
  options: SearchOptions,
): SearchPage {
  const pattern = `%${options.query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const indexed = [...options.query].length >= 3;
  const clauses = ["draft = 0", "hidden = 0", "deletedAt IS NULL"];
  const args: (string | number)[] = [];
  if (indexed) {
    clauses.push(
      "id IN (SELECT rowid FROM posts_search WHERE posts_search MATCH ?)",
    );
    // Quote the entire phrase: FTS operators and quotes are ordinary user text.
    args.push(`"${options.query.replace(/"/g, '""')}"`);
  }
  clauses.push(
    "(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')",
  );
  args.push(pattern, pattern, pattern);
  if (options.tag) {
    clauses.push(
      "EXISTS (SELECT 1 FROM json_each(posts.tags) WHERE value = ?)",
    );
    args.push(options.tag);
  }
  if (options.year && /^\d{4}$/.test(options.year)) {
    clauses.push("substr(publishedAt,1,4)=?");
    args.push(options.year);
  }
  if (options.series) {
    clauses.push("series=?");
    args.push(options.series.slice(0, 100));
  }
  const where = clauses.join(" AND ");
  // A read transaction gives the count and page a consistent WAL snapshot.
  return database.transaction(() => {
    const total = (
      database
        .prepare(`SELECT count(*) AS n FROM posts WHERE ${where}`)
        .get(...args) as { n: number }
    ).n;
    const pageSize = 20;
    const page = Math.max(
      1,
      Math.min(
        Number.isSafeInteger(options.page) ? options.page! : 1,
        Math.max(1, Math.ceil(total / pageSize)),
      ),
    );
    const rows = database
      .prepare(
        `SELECT id FROM posts WHERE ${where} ORDER BY publishedAt DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...args, pageSize, (page - 1) * pageSize) as { id: number }[];
    return { ids: rows.map((row) => row.id), total, page, pageSize };
  })();
}

export class SearchBusyError extends Error {
  code = "SEARCH_BUSY";
}
let worker: Worker | undefined;
let stopping = false;
let sequence = 0;
const pending = new Map<
  number,
  {
    resolve: (value: SearchPage) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }
>();
const modulePath = createRequire(import.meta.url).resolve("better-sqlite3");

export async function closeSearchWorker() {
  const current = worker;
  worker = undefined;
  for (const task of pending.values()) {
    clearTimeout(task.timer);
    task.reject(new SearchBusyError("Search stopped."));
  }
  pending.clear();
  if (current) {
    stopping = true;
    try {
      await current.terminate();
    } finally {
      stopping = false;
    }
  }
}

function failWorker(error: Error) {
  const previous = worker;
  worker = undefined;
  for (const task of pending.values()) {
    clearTimeout(task.timer);
    task.reject(error);
  }
  pending.clear();
  if (previous) {
    stopping = true;
    // Native SQLite may finish its current call before worker termination. Never
    // spawn replacements concurrently while the timed-out worker is still alive.
    void previous.terminate().finally(() => {
      stopping = false;
    });
  }
}

export function searchInWorker(
  databasePath: string,
  options: SearchOptions,
): Promise<SearchPage> {
  // One worker per application process; bound work waiting behind a costly query.
  if (stopping || pending.size >= 16)
    return Promise.reject(new SearchBusyError("Search is busy. Please retry."));
  if (!worker) {
    const current = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads');
      const Database = require(workerData.modulePath);
      const database = new Database(workerData.databasePath, { readonly: true, fileMustExist: true });
      database.pragma('busy_timeout = 1000');
      const execute = ${executeSearch.toString()};
      parentPort.on('message', ({ id, options }) => {
        try { parentPort.postMessage({ id, value: execute(database, options) }); }
        catch { parentPort.postMessage({ id, failed: true }); }
      });
    `,
      { eval: true, workerData: { databasePath, modulePath } },
    );
    worker = current;
    current.on("message", ({ id, value, failed }) => {
      if (worker !== current) return;
      const task = pending.get(id);
      if (!task) return;
      clearTimeout(task.timer);
      pending.delete(id);
      if (failed) task.reject(new SearchBusyError("Search unavailable."));
      else task.resolve(value);
      if (!pending.size) current.unref();
    });
    current.on("error", () => {
      if (worker === current)
        failWorker(new SearchBusyError("Search unavailable."));
    });
    current.on("exit", () => {
      if (worker === current)
        failWorker(new SearchBusyError("Search unavailable."));
    });
  }
  const current = worker;
  current.ref();
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(
      () => failWorker(new SearchBusyError("Search timed out. Please retry.")),
      3000,
    );
    pending.set(id, { resolve, reject, timer });
    current.postMessage({ id, options });
  });
}

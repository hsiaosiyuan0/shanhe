import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { storySchema, type Story, type Message, type Snapshot } from '../shared/schema.js';
import { seedStories } from './seeds.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class Store {
  db: DatabaseSync;
  constructor(path: string, seed = true) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, document TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TEXT NOT NULL, document TEXT NOT NULL, messages TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    if (seed && !this.db.prepare('SELECT value FROM metadata WHERE key=?').get('seeded')) {
      this.transaction(() => {
        seedStories().forEach((s) => this.insert(s));
        this.db.prepare('INSERT INTO metadata VALUES (?,?)').run('seeded', '1');
      });
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  list(): Story[] {
    return (
      this.db.prepare('SELECT document FROM stories ORDER BY rowid').all() as { document: string }[]
    ).map((r) => storySchema.parse(JSON.parse(r.document)));
  }
  get(id: string): Story {
    const row = this.db.prepare('SELECT document FROM stories WHERE id=?').get(id) as
      { document: string } | undefined;
    if (!row) throw new HttpError(404, '找不到这个故事');
    return storySchema.parse(JSON.parse(row.document));
  }
  insert(story: Story) {
    const valid = storySchema.parse(story);
    this.db
      .prepare('INSERT INTO stories VALUES (?,?,?)')
      .run(valid.id, JSON.stringify(valid), valid.revision);
    return valid;
  }
  save(story: Story, expected: number) {
    const next = storySchema.parse({
      ...story,
      revision: expected + 1,
      updatedAt: new Date().toISOString(),
    });
    const result = this.db
      .prepare('UPDATE stories SET document=?, revision=? WHERE id=? AND revision=?')
      .run(JSON.stringify(next), next.revision, next.id, expected);
    if (!result.changes) throw new HttpError(409, '故事已在另一处更新，请刷新后重试。');
    return next;
  }
  messages(id: string): Message[] {
    return (
      this.db.prepare('SELECT document FROM messages WHERE story_id=? ORDER BY rowid').all(id) as {
        document: string;
      }[]
    ).map((r) => JSON.parse(r.document));
  }
  addMessage(id: string, message: Message) {
    this.db
      .prepare('INSERT INTO messages VALUES (?,?,?)')
      .run(message.id, id, JSON.stringify(message));
  }
  snapshots(id: string): Snapshot[] {
    return this.db
      .prepare(
        'SELECT id,name,created_at AS createdAt FROM snapshots WHERE story_id=? ORDER BY rowid DESC',
      )
      .all(id) as Snapshot[];
  }
  detail(id: string) {
    return { story: this.get(id), messages: this.messages(id), snapshots: this.snapshots(id) };
  }
  snapshot(id: string, name: string) {
    const snapshot = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    this.db
      .prepare('INSERT INTO snapshots VALUES (?,?,?,?,?,?)')
      .run(
        snapshot.id,
        id,
        name,
        snapshot.createdAt,
        JSON.stringify(this.get(id)),
        JSON.stringify(this.messages(id)),
      );
    return snapshot;
  }
  restore(id: string, snapshotId: string, revision: number) {
    return this.transaction(() => {
      const row = this.db
        .prepare('SELECT document,messages FROM snapshots WHERE id=? AND story_id=?')
        .get(snapshotId, id) as { document: string; messages: string } | undefined;
      if (!row) throw new HttpError(404, '找不到这个版本');
      this.snapshot(id, '恢复前的自动备份');
      const story = this.save({ ...JSON.parse(row.document), id }, revision);
      this.db.prepare('DELETE FROM messages WHERE story_id=?').run(id);
      (JSON.parse(row.messages) as Message[]).forEach((m) =>
        this.addMessage(id, { ...m, id: randomUUID() }),
      );
      return story;
    });
  }
  delete(id: string) {
    this.get(id);
    this.db.prepare('DELETE FROM stories WHERE id=?').run(id);
  }
  settings(): { baseUrl?: string; model?: string; apiKey?: string } {
    const row = this.db.prepare('SELECT document FROM settings WHERE id=1').get() as
      { document: string } | undefined;
    return row ? JSON.parse(row.document) : {};
  }
  setSettings(value: object) {
    this.db
      .prepare(
        'INSERT INTO settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document',
      )
      .run(JSON.stringify(value));
  }
  close() {
    this.db.close();
  }
}

import {
  storySchema,
  type Story,
  type StoryDetail,
  type Message,
  type Snapshot,
} from '../../shared/schema';
import { seedStories } from '../../shared/seeds';

type SavedSnapshot = Snapshot & { story: Story; messages: Message[] };
type RecordData = { id: string; story: Story; messages: Message[]; snapshots: SavedSnapshot[] };

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const complete = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('浏览器保存失败，请检查可用空间后重试。'));
    tx.onerror = () => reject(tx.error);
  });
const detail = (record: RecordData): StoryDetail => ({
  story: record.story,
  messages: record.messages,
  snapshots: record.snapshots.map(({ id, name, createdAt }) => ({ id, name, createdAt })),
});

/** Each story, conversation and its snapshots commit in one IndexedDB transaction. */
export class BrowserStore {
  private database: Promise<IDBDatabase>;
  constructor(name = 'shanhe-browser-v1') {
    this.database = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const stories = req.result.createObjectStore('stories', { keyPath: 'id' });
        // Keep the v1 store layout compatible with existing browser libraries.
        req.result.createObjectStore('settings');
        const now = Date.now();
        seedStories().forEach((story, index) =>
          stories.add({
            id: story.id,
            story: { ...story, createdAt: new Date(now + index).toISOString() },
            messages: [],
            snapshots: [],
          }),
        );
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () =>
        reject(new Error('无法打开浏览器故事库，请允许本站保存数据，或使用本地版。'));
      req.onblocked = () => reject(new Error('故事库正在升级，请关闭其他山河标签页后重试。'));
    });
  }
  private async transaction<T>(
    store: string,
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => Promise<T>,
  ) {
    const db = await this.database;
    const tx = db.transaction(store, mode);
    const done = complete(tx);
    try {
      const result = await work(tx.objectStore(store));
      await done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already completed or aborted */
      }
      await done.catch(() => {});
      throw error;
    }
  }
  async list(): Promise<Story[]> {
    return this.transaction('stories', 'readonly', async (store) => {
      const records = await request<RecordData[]>(store.getAll());
      return records
        .map((r) => r.story)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title));
    });
  }
  private async record(id: string) {
    return this.transaction('stories', 'readonly', async (store) => {
      const record = await request<RecordData | undefined>(store.get(id));
      if (!record) throw new Error('找不到这个故事');
      return record;
    });
  }
  async detail(id: string) {
    return detail(await this.record(id));
  }
  async insert(story: Story, messages: Message[] = []) {
    const valid = storySchema.parse(story);
    return this.transaction('stories', 'readwrite', async (store) => {
      await request(store.add({ id: valid.id, story: valid, messages, snapshots: [] }));
      return valid;
    });
  }
  private async mutate<T>(id: string, change: (record: RecordData) => T) {
    return this.transaction('stories', 'readwrite', async (store) => {
      const record = await request<RecordData | undefined>(store.get(id));
      if (!record) throw new Error('找不到这个故事');
      const result = change(record);
      await request(store.put(record));
      return result;
    });
  }
  private update(record: RecordData, story: Story, revision: number) {
    if (record.story.revision !== revision) throw new Error('故事已在另一处更新，请刷新后重试。');
    record.story = storySchema.parse({
      ...story,
      id: record.id,
      createdAt: record.story.createdAt,
      revision: revision + 1,
      updatedAt: new Date().toISOString(),
    });
    return record.story;
  }
  async save(story: Story, revision: number) {
    return this.mutate(story.id, (record) => this.update(record, story, revision));
  }
  private backup(record: RecordData, name: string) {
    const snapshot = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    record.snapshots.unshift({
      ...snapshot,
      story: structuredClone(record.story),
      messages: structuredClone(record.messages),
    });
    return snapshot;
  }
  async snapshot(id: string, name: string) {
    return this.mutate(id, (record) => this.backup(record, name));
  }
  async restore(id: string, snapshotId: string, revision: number) {
    return this.mutate(id, (record) => {
      const snapshot = record.snapshots.find((s) => s.id === snapshotId);
      if (!snapshot) throw new Error('找不到这个版本');
      this.backup(record, '恢复前的自动备份');
      this.update(record, snapshot.story, revision);
      record.messages = structuredClone(snapshot.messages);
      return detail(record);
    });
  }
  async delete(id: string) {
    return this.transaction('stories', 'readwrite', async (store) => {
      await request(store.delete(id));
    });
  }
  async close() {
    (await this.database).close();
  }
}

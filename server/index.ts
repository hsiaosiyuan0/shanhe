import 'dotenv/config';
import { resolve } from 'node:path';
import { Store } from './db.js';
import { createApp, stopChats } from './app.js';
import { stopAgentProcesses } from './agents/rpc.js';
process.umask(0o077);
const store = new Store(resolve(process.env.DATA_DIR || 'data', 'shanhe.sqlite'));
const port = Number(process.env.PORT || 4310);
const server = createApp(store, process.env.STATIC_DIR).listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(
    `山河 API · http://127.0.0.1:${typeof address === 'object' && address ? address.port : port} · SQLite ready`,
  );
});
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChats();
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    await Promise.all([closed, stopAgentProcesses()]);
    store.close();
    process.exit(0);
  });

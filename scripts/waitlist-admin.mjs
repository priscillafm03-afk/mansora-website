// Private operator tool; no public read/list/delete route exists.
// Load env from a secret manager or: node --env-file=.env.local scripts/waitlist-admin.mjs ...
import { writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { storeConfig, command, digest } from '../api/_waitlist-store.js';
const [action, argument] = process.argv.slice(2);
const config = storeConfig();
if (['get', 'delete'].includes(action) && argument) {
  const key = `${config.prefix}entry:${digest(config, argument.trim().toLowerCase())}`;
  if (action === 'get') console.log(await command(config, ['GET', key]) || 'No saved request');
  else console.log(`Deleted ${await command(config, ['DEL', key])} saved request(s). Check team email copies separately.`);
} else if (action === 'export' && argument) {
  const path = resolve(argument);
  if (path.startsWith(resolve('public') + sep) || !path.endsWith('.json')) throw new Error('Export to a private .json file outside public/');
  let cursor = '0';
  const records = new Map();
  do {
    const batch = await command(config, ['SCAN', cursor, 'MATCH', `${config.prefix}entry:*`, 'COUNT', '100']);
    cursor = String(batch[0]);
    for (const key of batch[1]) {
      const value = await command(config, ['GET', key]);
      if (value) records.set(key, JSON.parse(value));
    }
  } while (cursor !== '0');
  await writeFile(path, JSON.stringify([...records.values()], null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(`Exported ${records.size} requests. Treat this file as private and apply the same retention/deletion rules.`);
} else {
  throw new Error('Usage: waitlist-admin.mjs get <email> | delete <email> | export <private-file.json>');
}

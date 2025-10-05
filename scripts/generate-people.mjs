import { tmpdir } from 'os';
import { join } from 'path';
import { createWriteStream, promises as fs } from 'fs';
import { get } from 'http';
import { spawnSync } from 'child_process';

const DB_URL = 'https://arkadia-people.delwing.workers.dev/download';
const OUT_FILE = new URL('../client/src/people.json', import.meta.url);

const guildMap = {
  1: 'CKN',
  2: 'ES',
  3: 'SC',
  4: 'KS',
  5: 'KM',
  6: 'OS',
  7: 'OHM',
  8: 'SGW',
  9: 'BK',
  10: 'WKS',
  11: 'LE',
  12: 'KG',
  13: 'KGKS',
  14: 'MC',
  15: 'OK',
  16: 'RA',
  17: 'GL',
  18: 'ZT',
  19: 'ZS',
  20: 'ZH',
  21: 'NPC',
  22: 'GP'
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', err => {
      reject(err);
    });
  });
}

function query(dbPath) {
  const result = spawnSync('sqlite3', ['-json', dbPath, 'SELECT name, short, title, updated, note, enemy, guild FROM people;'], {encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return JSON.parse(result.stdout || '[]');
}

function transform(rows) {
  return rows.map(row => ({
    name: row.name,
    description: row.short || row.title || '',
    guild: guildMap[row.guild] || 'NPC'
  }));
}

async function main() {
  const tmpPath = join(tmpdir(), 'Database_people.db');
  await download(DB_URL, tmpPath);
  const rows = query(tmpPath);
  const data = transform(rows);
  await fs.writeFile(OUT_FILE, JSON.stringify(data));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

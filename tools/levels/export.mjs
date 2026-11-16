/**
 * Експортує рівні з Blender у гру: levels/<id>.blend -> src/levels/<id>.level.json.
 *
 * pnpm levels            усі рівні
 * pnpm levels village    лише названі
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const only = process.argv.slice(2);
const all = readdirSync('levels')
  .filter((f) => f.endsWith('.blend'))
  .map((f) => f.slice(0, -'.blend'.length));
const unknown = only.filter((id) => !all.includes(id));
if (unknown.length > 0) throw new Error(`немає таких рівнів: ${unknown.join(', ')} (є: ${all.join(', ')})`);
const ids = all.filter((id) => only.length === 0 || only.includes(id));
if (ids.length === 0) throw new Error('немає рівнів у levels/*.blend');
let failed = false;
for (const id of ids) {
  const run = spawnSync(
    process.env.BLENDER ?? 'blender',
    // --python-exit-code: без нього Blender завершується з кодом 0 навіть після необробленого винятку в скрипті.
    ['--background', `levels/${id}.blend`, '--python-exit-code', '1', '--python', 'tools/levels/export_level.py', '--', `src/levels/${id}.level.json`],
    { encoding: 'utf8' },
  );
  const lines = (run.stdout ?? '').split('\n');
  const from = lines.findIndex((l) => l.startsWith('ЕКСПОРТ ЗУПИНЕНО') || l.startsWith('exported '));
  const exported = lines.some((l) => l.startsWith('exported '));
  const ok = run.status === 0 && exported;
  console.log(`${id}: ${ok ? 'ok' : 'ПОМИЛКА'}`);
  if (!ok) {
    failed = true;
    if (run.error) console.log(`не вдалося запустити Blender: ${run.error.message}`);
    else console.log(from >= 0 ? lines.slice(from).join('\n') : `${run.stdout}\n${run.stderr}`);
  }
}
process.exit(failed ? 1 : 0);

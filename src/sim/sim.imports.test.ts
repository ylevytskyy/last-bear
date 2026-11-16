import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = __dirname;
/** Усі файли правил, включно з підпапками (`enemies/` тощо). */
function ruleFiles(at: string): string[] {
  return readdirSync(at, { withFileTypes: true }).flatMap((e) => {
    const path = join(at, e.name);
    if (e.isDirectory()) return ruleFiles(path);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [relative(dir, path)] : [];
  });
}
const files = ruleFiles(dir);

describe('rules layer stays free of the renderer (ADR 0001)', () => {
  it('finds rule files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s imports no three/gsap and touches no DOM or audio', (file) => {
    const src = readFileSync(join(dir, file), 'utf8');
    expect(src).not.toMatch(/from\s+['"](three|gsap)(\/[^'"]*)?['"]/);
    expect(src).not.toMatch(/\b(document|window|AudioContext)\b/);
  });
});

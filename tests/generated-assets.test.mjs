import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { XMLValidator } from 'fast-xml-parser';
import { sectionNames } from '../scripts/update-readme.mjs';

test('checked-in README images resolve to valid accessible local SVGs', async () => {
  const root = new URL('../', import.meta.url);
  const readme = await readFile(new URL('README.md', root), 'utf8');
  const images = [...readme.matchAll(/!\[([^\]]+)\]\(\.\/assets\/([a-z-]+\.svg)\)/g)];
  assert.ok(images.length >= 5);
  for (const [, alt, name] of images) {
    assert.ok(alt.trim());
    const content = await readFile(new URL(`assets/${name}`, root), 'utf8');
    assert.equal(XMLValidator.validate(content), true, name);
    assert.match(content, /role="img"/);
    assert.match(content, /<title id="title">/);
    assert.match(content, /<desc id="desc">/);
    assert.doesNotMatch(content, /NaN|Infinity|undefined|<script|<foreignObject/);
  }
  for (const name of sectionNames) {
    assert.equal(readme.split(`<!-- ${name}:START -->`).length, 2, name);
    assert.equal(readme.split(`<!-- ${name}:END -->`).length, 2, name);
  }
  assert.doesNotMatch(readme, /等待首次更新|等待贡献数据更新/);
});

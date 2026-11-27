import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { XMLValidator } from 'fast-xml-parser';
import { sectionNames } from '../scripts/update-readme.mjs';

test('checked-in README images resolve to valid accessible local SVGs', async () => {
  const root = new URL('../', import.meta.url);
  const readme = await readFile(new URL('README.md', root), 'utf8');
  const images = [...readme.matchAll(/!\[([^\]]+)\]\(\.\/assets\/([a-z-]+\.svg)\)/g)];
  assert.ok(images.length >= 3);
  assert.match(readme, /^<!-- CONTRIBUTIONS:START -->\s*!\[[^\]]+\]\(\.\/assets\/snake\.svg\)/);
  assert.doesNotMatch(readme, /banner\.svg/);
  assert.doesNotMatch(readme, /你好，我是|渺万里层云|欢迎来到|ABOUT:|关注方向|正在做|正在学|文字与统计图每|动态区域外的文字|配置与部署方法见/);
  for (const [, alt, name] of images) {
    assert.ok(alt.trim());
    const content = await readFile(new URL(`assets/${name}`, root), 'utf8');
    assert.equal(XMLValidator.validate(content), true, name);
    assert.match(content, /role="img"/);
    assert.match(content, /<title id="title">/);
    assert.match(content, /<desc id="desc">/);
    assert.doesNotMatch(content, /NaN|Infinity|undefined|<script|<foreignObject/);
    if (name === 'commits.svg') {
      assert.match(content, /d="M[^"]+ C[^"]+" fill="none" stroke="#38bdf8"/);
      assert.match(content, /fill="url\(#commit-area\)"/);
    }
  }
  for (const name of sectionNames) {
    assert.equal(readme.split(`<!-- ${name}:START -->`).length, 2, name);
    assert.equal(readme.split(`<!-- ${name}:END -->`).length, 2, name);
  }
  assert.doesNotMatch(readme, /等待首次更新|等待贡献数据更新/);
});

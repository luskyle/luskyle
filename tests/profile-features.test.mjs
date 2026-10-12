import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { XMLValidator } from 'fast-xml-parser';
import {
  validateConfig, renderFeatured, renderRecent, renderReleases, renderPullRequests,
  fetchCalendar, parseFeed, fetchArticles, renderBlog, updateReadme, sectionNames,
} from '../scripts/update-readme.mjs';
import {
  escapeXml, renderBars, renderAssets, contributionStreaks, renderCalendar, renderBanner,
} from '../scripts/charts.mjs';

const config = {
  featuredRepositories: ['demo'], rssFeeds: [], technologyLabels: ['C / C++', 'Git'],
  focus: 'Developer tools', workingOn: '', learning: '',
};
const repository = {
  name: 'demo', html_url: 'https://github.com/example/demo', description: 'Tools <&> | notes',
  language: 'C++', stargazers_count: 3, forks_count: 1, fork: false, archived: false,
  updated_at: '2026-10-10T00:00:00Z', pushed_at: '2026-10-09T00:00:00Z',
};
const user = {
  login: 'example', name: 'Example <&>', public_repos: 1, followers: 2, following: 3,
  email: 'public@example.com', blog: 'https://example.com',
};
const calendar = {
  totalContributions: 9,
  weeks: [{ contributionDays: [
    { date: '2026-10-05', contributionCount: 2 },
    { date: '2026-10-06', contributionCount: 3 },
    { date: '2026-10-07', contributionCount: 0 },
    { date: '2026-10-08', contributionCount: 1 },
    { date: '2026-10-09', contributionCount: 1 },
    { date: '2026-10-10', contributionCount: 2 },
    { date: '2026-10-11', contributionCount: 0 },
  ] }],
};
const graphql = async () => ({
  data: { user: { contributionsCollection: { contributionCalendar: calendar } } },
});

test('profile configuration validates arrays, safe repo names and HTTPS feeds', () => {
  assert.deepEqual(validateConfig(config), config);
  for (const invalid of [
    { featuredRepositories: null }, { featuredRepositories: ['../secret'] },
    { rssFeeds: ['http://example.com/feed'] }, { rssFeeds: ['file:///etc/passwd'] },
    { technologyLabels: Array(7).fill('JS') }, { learning: 42 },
  ]) {
    assert.throws(() => validateConfig({ ...config, ...invalid }));
  }
});

test('featured cards resolve configured repos and escape Markdown', () => {
  const output = renderFeatured([repository], ['DEMO']);
  assert.match(output, /https:\/\/github.com\/example\/demo/);
  assert.ok(output.includes('&lt;&amp;&gt; \\| notes'));
  assert.match(output, /⭐ 3 · Forks 1/);
  assert.throws(() => renderFeatured([repository], ['missing']), /不存在/);
  assert.match(renderFeatured([], []), /尚未配置/);
});

test('recent projects sort by push time, not metadata update time, and exclude forks/archives', () => {
  const repos = [
    repository,
    { ...repository, name: 'newer', updated_at: '2020-01-01', pushed_at: '2026-10-12' },
    { ...repository, name: 'fork', fork: true, pushed_at: '2026-10-13' },
    { ...repository, name: 'archive', archived: true, pushed_at: '2026-10-14' },
    { ...repository, name: 'never', pushed_at: null },
    { ...repository, name: 'third', pushed_at: '2026-10-08' },
    { ...repository, name: 'fourth', pushed_at: '2026-10-07' },
  ];
  const output = renderRecent(repos);
  assert.ok(output.indexOf('[newer]') < output.indexOf('[demo]'));
  assert.doesNotMatch(output, /\[fork\]|\[archive\]|\[never\]|\[fourth\]/);
  assert.match(renderRecent([]), /暂无/);
});

test('release list excludes drafts and prereleases, sorts and caps at five', () => {
  const release = { repository: 'demo', tag_name: 'v1', html_url: 'https://github.com/example/demo/releases/tag/v1',
    published_at: '2026-10-10T00:00:00Z', draft: false, prerelease: false };
  const output = renderReleases([
    { ...release, tag_name: 'draft', draft: true },
    { ...release, tag_name: 'beta', prerelease: true },
    ...Array.from({ length: 7 }, (_, i) => ({ ...release, tag_name: `v${i}`, published_at: `2026-10-${10 + i}` })),
  ]);
  assert.equal(output.split('\n').length, 5);
  assert.ok(output.indexOf('[v6]') < output.indexOf('[v5]'));
  assert.doesNotMatch(output, /draft|beta|\[v0\]/);
  assert.match(renderReleases([]), /暂无/);
});

test('PRs use qualified repository links and distinguish merged, closed and open', () => {
  const pr = { html_url: 'https://github.com/other/project/pull/42', number: 42,
    title: '<fix> | test', state: 'closed', pull_request: { merged_at: '2026-10-10' } };
  assert.match(renderPullRequests([pr]), /\[other\/project#42\].*已合并/);
  assert.match(renderPullRequests([{ ...pr, pull_request: {} }]), /已关闭/);
  assert.match(renderPullRequests([{ ...pr, state: 'open', pull_request: {} }]), /进行中/);
  assert.match(renderPullRequests([]), /暂未检索/);
});

test('contribution API never substitutes events for contributions or hides GraphQL errors', async () => {
  assert.equal(await fetchCalendar('example', '', () => { throw new Error('Must not request'); }), null);
  assert.deepEqual(await fetchCalendar('example', 'fixture-token', async (body) => {
    assert.deepEqual(body.variables, { login: 'example' });
    return graphql();
  }), calendar);
  await assert.rejects(fetchCalendar('example', 'fixture-token', async () => ({
    errors: [{ message: 'Denied' }],
  })), /Denied/);
  await assert.rejects(fetchCalendar('example', 'fixture-token', async () => ({ data: { user: null } })), /未返回/);
});

test('RSS and Atom parse single/multiple entries with dates and alternate links', () => {
  const rss = '<rss version="2.0"><channel><item><title>A &amp; B</title><link>https://example.com/a</link><pubDate>Mon, 12 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>';
  assert.deepEqual(parseFeed(rss), [{
    title: 'A & B', link: 'https://example.com/a', timestamp: Date.parse('2026-10-12T00:00:00Z'),
  }]);
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom</title><link rel="self" href="https://example.com/feed"/><link rel="alternate" href="https://example.com/atom"/><updated>2026-10-11T00:00:00Z</updated></entry><entry><title>No date</title><link href="https://example.com/b"/></entry></feed>';
  const entries = parseFeed(atom);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].link, 'https://example.com/atom');
  assert.equal(entries[1].timestamp, null);
  assert.deepEqual(parseFeed('<rss version="2.0"><channel/></rss>'), []);
  assert.deepEqual(parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"/>'), []);
});

test('RSS errors, unsafe links and malformed XML are reported', async () => {
  for (const xml of [
    '<!DOCTYPE rss><rss/>',
    '<rss><channel>',
    '<html/>',
    '<rss><channel><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>',
    '<rss><channel><item><title>Missing</title></item></channel></rss>',
    '<rss><channel><item><title>Date</title><link>https://example.com</link><pubDate>nonsense</pubDate></item></channel></rss>',
  ]) assert.throws(() => parseFeed(xml));
  await assert.rejects(fetchArticles(['https://example.com/rss'],
    async () => ({ ok: false, status: 500 })), /HTTP 500/);
  await assert.rejects(fetchArticles(['https://example.com/rss'],
    async () => ({ ok: true, text: async () => 'x'.repeat(2_000_001) })), /2 MB/);
  assert.match(renderBlog([], false), /尚未配置/);
  assert.match(renderBlog([], true), /暂无文章/);
});

test('articles merge across feeds, deduplicate, sort and cap at five', async () => {
  const xml = '<rss><channel>' + Array.from({ length: 7 }, (_, i) =>
    `<item><title>Post ${i}</title><link>https://example.com/${i}</link><pubDate>2026-10-${10 + i}T00:00:00Z</pubDate></item>`).join('') + '</channel></rss>';
  const articles = await fetchArticles(['https://example.com/a', 'https://example.com/b'],
    async () => ({ ok: true, text: async () => xml }));
  assert.equal(articles.length, 5);
  assert.equal(articles[0].title, 'Post 6');
  assert.equal(new Set(articles.map((article) => article.link)).size, 5);
  assert.match(renderBlog(articles, true), /2026-10-16.*Post 6/);
});

test('streaks include yesterday when today is empty and reset after a gap', () => {
  assert.deepEqual(contributionStreaks(calendar), { current: 3, longest: 3 });
  assert.deepEqual(contributionStreaks({ weeks: [] }), { current: 0, longest: 0 });
  const copy = structuredClone(calendar);
  copy.weeks[0].contributionDays.at(-1).contributionCount = 1;
  assert.deepEqual(contributionStreaks(copy), { current: 4, longest: 4 });
  copy.weeks[0].contributionDays.at(-1).contributionCount = 0;
  copy.weeks[0].contributionDays.at(-2).contributionCount = 0;
  assert.equal(contributionStreaks(copy).current, 0);
});

test('all generated SVGs are valid, escaped and accessible, with bounded bars and animation', () => {
  const assets = renderAssets(user, [repository], [], calendar, config);
  assert.equal(Object.keys(assets).length, 7);
  for (const [name, content] of Object.entries(assets)) {
    assert.equal(XMLValidator.validate(content), true, name);
    assert.match(content, /<title id="title">/);
    assert.match(content, /<desc id="desc">/);
    assert.doesNotMatch(content, /<script|<foreignObject|<image|<iframe/);
    assert.ok(!content.includes('Example <&>'));
  }
  assert.match(assets['banner.svg'], /clipPath id="typing"/);
  assert.match(assets['snake.svg'], /animateMotion/);
  assert.match(assets['languages.svg'], /C\+\+: 1/);
  assert.match(assets['activity.svg'], /No|Days 1–7: 0/);
  assert.match(renderBars('Empty', '', []), /No public data/);
  assert.match(renderBars('Zero', '', [['zero', 0]]), /width="0"/);
  assert.doesNotMatch(renderBars('Huge', '', [['huge', 1_000_000]]), /NaN|Infinity/);
  assert.equal(escapeXml('<"&\'>'), '&lt;&quot;&amp;&apos;&gt;');
  assert.doesNotMatch(renderCalendar({ totalContributions: 0, weeks: [] }, true), /animateMotion/);
});

test('language graph counts original primary-language repos, not stars or forks', () => {
  const assets = renderAssets(user, [
    repository, { ...repository, language: 'Python', stargazers_count: 999 },
    { ...repository, language: 'Python', fork: true }, { ...repository, language: null },
  ], [], null, config);
  assert.match(assets['languages.svg'], /C\+\+: 1; Python: 1/);
  assert.equal(Object.keys(assets).length, 5);
});

test('redesigned banner uses a circuit monogram, escapes names and fits longer names', () => {
  const banner = renderBanner({ login: 'luskyle', name: 'Luskyle' });
  assert.equal(XMLValidator.validate(banner), true);
  assert.match(banner, /viewBox="0 0 960 280"/);
  assert.match(banner, />LK<\/text>/);
  assert.match(banner, /id="grid"/);
  assert.match(banner, /id="typing"/);
  assert.doesNotMatch(banner, /cx="870"|<image|<script/);
  const escaped = renderBanner({ login: 'example', name: '<A & B>' });
  assert.match(escaped, /&lt;A &amp; B&gt;/);
  assert.match(escaped, />EX<\/text>/);
  const long = renderBanner({ login: 'example', name: 'A'.repeat(50) });
  assert.match(long, /font-size="16\.615/);
  assert.equal(XMLValidator.validate(long), true);
});

test('full update writes every section and chart; repeated update is unchanged; failure preserves files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'profile-features-test-'));
  const readmePath = join(directory, 'README.md');
  const template = 'STATIC INTRO\n' + sectionNames.map((name) =>
    `<!-- ${name}:START -->\nold\n<!-- ${name}:END -->`).join('\n') + '\nSTATIC END\n';
  try {
    await writeFile(readmePath, template);
    const request = async (path) => {
      if (path === '/users/example') return user;
      if (path.includes('/repos?')) return [repository];
      if (path.includes('/events/public?')) return [];
      if (path.includes('/releases?')) return [];
      if (path.startsWith('/search/issues?')) return { items: [], incomplete_results: false };
      throw new Error(`Unexpected request ${path}`);
    };
    const options = { username: 'example', token: 'fixture-token', readmePath, config, request, graphql };
    assert.equal(await updateReadme(options), true);
    const result = await readFile(readmePath, 'utf8');
    assert.ok(result.startsWith('STATIC INTRO\n'));
    assert.ok(result.endsWith('\nSTATIC END\n'));
    assert.doesNotMatch(result, /\nold\n/);
    assert.match(result, /contributions\.svg/);
    assert.match(result, /mailto:public%40example\.com/);
    assert.match(result, /https:\/\/example\.com/);
    const assetNames = await readdir(join(directory, 'assets'));
    assert.equal(assetNames.length, 7);
    const previousAssets = await Promise.all(assetNames.map((name) =>
      readFile(join(directory, 'assets', name), 'utf8')));
    assert.equal(await updateReadme(options), false);
    await assert.rejects(updateReadme({ ...options, graphql: async () => ({ errors: [{ message: 'Failed' }] }) }), /Failed/);
    await assert.rejects(updateReadme({ ...options,
      request: async (path) => path.startsWith('/search') ? { incomplete_results: true } : request(path),
    }), /不完整/);
    await assert.rejects(updateReadme({ ...options, config: { ...config, rssFeeds: ['https://example.com/rss'] },
      feedFetch: async () => ({ ok: false, status: 503 }),
    }), /HTTP 503/);
    assert.equal(await readFile(readmePath, 'utf8'), result);
    assert.deepEqual(await Promise.all(assetNames.map((name) =>
      readFile(join(directory, 'assets', name), 'utf8'))), previousAssets);
  } finally {
    await rm(directory, { recursive: true });
  }
});

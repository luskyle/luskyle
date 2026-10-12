import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  escapeMarkdown, replaceSection, renderProfile, renderRepositories,
  renderActivity, githubRequest, updateReadme,
  sectionNames,
} from '../scripts/update-readme.mjs';

const template = '静态介绍\n' + sectionNames
  .map((name) => `<!-- ${name}:START -->\n旧内容\n<!-- ${name}:END -->`)
  .join('\n') + '\n静态结尾\n';
const repo = (overrides = {}) => ({
  name: 'demo', html_url: 'https://github.com/example/demo',
  description: 'A project', language: 'JavaScript', stargazers_count: 2,
  fork: false, archived: false, updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

test('only marker contents are replaced; invalid and duplicate markers fail', () => {
  const updated = replaceSection(template, 'PROFILE', '新内容');
  assert.equal(updated, template.replace(
    '<!-- PROFILE:START -->\n旧内容', '<!-- PROFILE:START -->\n新内容'));
  for (const invalid of [
    '', '<!-- PROFILE:END --><!-- PROFILE:START -->',
    template + '<!-- PROFILE:START -->',
    template + '<!-- PROFILE:END -->',
  ]) {
    assert.throws(() => replaceSection(invalid, 'PROFILE', ''), /README/);
  }
});

test('Markdown table values cannot inject HTML, columns or extra lines', () => {
  assert.equal(escapeMarkdown('<b> x|y\n[z]*'), '&lt;b&gt; x\\|y \\[z\\]\\*');
});

test('stats count original stars, including archived but not forked repositories', () => {
  const output = renderProfile({ public_repos: 3, followers: 4, following: 5 },
    [repo(), repo({ archived: true, stargazers_count: 3 }), repo({ fork: true, stargazers_count: 100 })]);
  assert.match(output, /\| 3 \| 4 \| 5 \| 5 \|/);
});

test('featured repos exclude forks/archives, sort by stars and recency, and cap at six', () => {
  const repos = Array.from({ length: 8 }, (_, i) => repo({ name: `repo${i}`, stargazers_count: i }));
  repos.push(repo({ name: 'forked', fork: true, stargazers_count: 999 }));
  repos.push(repo({ name: 'archived', archived: true, stargazers_count: 999 }));
  const output = renderRepositories(repos);
  assert.equal(output.split('\n').length, 8);
  assert.ok(output.indexOf('[repo7]') < output.indexOf('[repo6]'));
  assert.doesNotMatch(output, /forked|archived|\[repo0\]|\[repo1\]/);
  const tied = renderRepositories([repo({ name: 'old' }), repo({ name: 'new', updated_at: '2026-02-01' })]);
  assert.ok(tied.indexOf('[new]') < tied.indexOf('[old]'));
  assert.match(renderRepositories([]), /暂无|暂时没有/);
});

test('activities skip private/unsupported events and cap at five', () => {
  const event = {
    type: 'PushEvent', public: true, repo: { name: 'example/demo' },
    payload: {}, created_at: '2026-10-12T00:00:00Z',
  };
  const output = renderActivity([
    { ...event, public: false, repo: { name: 'private/secret' } },
    { ...event, type: 'UnknownEvent' }, ...Array(8).fill(event),
  ]);
  assert.equal(output.split('\n').length, 5);
  assert.doesNotMatch(output, /private|Unknown/);
  assert.match(renderActivity([]), /暂无/);
});

test('supported activity types render links and escape ref/tag values', () => {
  const base = { public: true, repo: { name: 'example/demo' }, created_at: '2026-10-12T00:00:00Z' };
  const issue = { number: 1, html_url: 'https://github.com/example/demo/issues/1' };
  const cases = [
    ['PullRequestEvent', { action: 'opened', pull_request: issue }, 'Pull Request'],
    ['IssuesEvent', { action: 'opened', issue }, 'Issue'],
    ['IssueCommentEvent', { issue, comment: { html_url: `${issue.html_url}#issuecomment-1` } }, '评论'],
    ['ReleaseEvent', { release: { tag_name: '<v1>', html_url: 'https://github.com/example/demo/releases/tag/v1' } }, '&lt;v1&gt;'],
    ['WatchEvent', {}, 'Star'],
    ['ForkEvent', {}, 'Fork'],
    ['CreateEvent', { ref_type: 'branch', ref: 'feature' }, 'feature'],
  ];
  for (const [type, payload, expected] of cases) {
    assert.ok(renderActivity([{ ...base, type, payload }]).includes(expected));
  }
});

test('activities are sorted newest first without modifying the input', () => {
  const base = { type: 'PushEvent', public: true, repo: { name: 'example/demo' }, payload: {} };
  const events = [
    { ...base, created_at: '2026-10-09T00:00:00Z' },
    { ...base, created_at: '2026-10-12T00:00:00Z' },
    { ...base, created_at: '2026-10-10T00:00:00Z' },
  ];
  const original = structuredClone(events);
  assert.deepEqual(renderActivity(events).split('\n').map((line) => line.slice(2, 12)),
    ['2026-10-12', '2026-10-10', '2026-10-09']);
  assert.deepEqual(events, original);
});

test('API errors are explicit and tokens are optional', async () => {
  for (const token of [undefined, 'test-token']) {
    await githubRequest('/users/example', token, async (url, options) => {
      assert.equal(url, 'https://api.github.com/users/example');
      assert.equal(options.headers.Authorization, token ? 'Bearer test-token' : undefined);
      return { ok: true, json: async () => ({ login: 'example' }) };
    });
  }
  await assert.rejects(githubRequest('/users/example', undefined,
    async () => ({ ok: false, status: 403 })), /HTTP 403/);
});

test('end-to-end update paginates, preserves static text and is idempotent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'profile-readme-test-'));
  const readmePath = join(directory, 'README.md');
  try {
    await writeFile(readmePath, template);
    const paths = [];
    const request = async (path) => {
      paths.push(path);
      if (path === '/users/example') return { login: 'example', public_repos: 101, followers: 2, following: 3 };
      if (path.includes('/repos?')) return path.endsWith('page=1') ? Array(100).fill(repo()) : [repo()];
      if (path.includes('/events/public?')) return [];
      if (path.includes('/releases?')) return [];
      if (path.startsWith('/search/issues?')) return { items: [], incomplete_results: false };
      throw new Error(`Unexpected path: ${path}`);
    };
    const options = {
      username: 'example', readmePath, request, token: '',
      config: { featuredRepositories: ['demo'], rssFeeds: [], technologyLabels: ['JavaScript'],
        focus: 'Tools', workingOn: '', learning: '' },
    };
    assert.equal(await updateReadme(options), true);
    const updated = await readFile(readmePath, 'utf8');
    assert.ok(updated.startsWith('静态介绍\n'));
    assert.ok(updated.endsWith('\n静态结尾\n'));
    assert.match(updated, /\| 101 \| 2 \| 3 \| 202 \|/);
    assert.ok(paths.some((path) => path.endsWith('page=2')));
    assert.equal(await updateReadme(options), false);
    await assert.rejects(updateReadme({ ...options, request: async () => { throw new Error('API unavailable'); } }), /API unavailable/);
    assert.equal(await readFile(readmePath, 'utf8'), updated);
    await writeFile(readmePath, 'no markers');
    await assert.rejects(updateReadme(options), /README/);
    assert.equal(await readFile(readmePath, 'utf8'), 'no markers');
    await assert.rejects(updateReadme({ ...options, username: '../invalid' }), /用户名/);
  } finally {
    await rm(directory, { recursive: true });
  }
});

import { readFile, writeFile, rename, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { renderAssets } from './charts.mjs';

const defaultReadme = fileURLToPath(new URL('../README.md', import.meta.url));
const defaultConfig = fileURLToPath(new URL('../profile.config.json', import.meta.url));
export const sectionNames = [
  'PROFILE', 'REPOSITORIES', 'FEATURED', 'RECENT', 'RELEASES',
  'BLOG', 'CONTRIBUTIONS', 'COMMITS', 'ABOUT', 'CONTACT', 'DOCUMENT_UPDATED',
];

export function escapeMarkdown(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]{}|]/g, '\\$&');
}

export function replaceSection(readme, name, content) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end);
  if (
    startIndex === -1 || endIndex === -1 ||
    readme.indexOf(start, startIndex + start.length) !== -1 ||
    readme.indexOf(end, endIndex + end.length) !== -1 ||
    endIndex < startIndex + start.length
  ) {
    throw new Error(`README 必须包含唯一且顺序正确的 ${start} / ${end}`);
  }
  return `${readme.slice(0, startIndex + start.length)}\n${content}\n${readme.slice(endIndex)}`;
}

export function renderProfile(user, repositories) {
  const stars = repositories.filter((repo) => !repo.fork)
    .reduce((total, repo) => total + repo.stargazers_count, 0);
  return [
    '| 公开仓库 | Followers | Following | 原创仓库 Stars |',
    '| ---: | ---: | ---: | ---: |',
    `| ${user.public_repos} | ${user.followers} | ${user.following} | ${stars} |`,
  ].join('\n');
}

export function renderRepositories(repositories, limit = 6) {
  const featured = repositories
    .filter((repo) => !repo.fork && !repo.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count ||
      b.updated_at.localeCompare(a.updated_at) || a.name.localeCompare(b.name))
    .slice(0, limit);
  if (!featured.length) return '暂时没有可展示的公开原创仓库。';
  return [
    '| 仓库 | 简介 | 语言 | Stars |',
    '| --- | --- | --- | ---: |',
    ...featured.map((repo) =>
      `| [${escapeMarkdown(repo.name)}](${repo.html_url}) | ${escapeMarkdown(repo.description) || '—'} | ${escapeMarkdown(repo.language) || '—'} | ${repo.stargazers_count} |`),
  ].join('\n');
}

export async function githubRequest(path, token, fetchImpl = fetch, body) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'profile-readme-updater',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(`https://api.github.com${path}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} 返回 HTTP ${response.status}；请检查用户名、Token 和 API 限额。`);
  }
  return response.json();
}

export function validateConfig(config) {
  if (config.featuredSource !== undefined && !['manual', 'pinned'].includes(config.featuredSource)) {
    throw new Error('featuredSource 必须是 manual 或 pinned。');
  }
  for (const key of ['featuredRepositories', 'rssFeeds']) {
    if (!Array.isArray(config[key]) || !config[key].every((value) => typeof value === 'string')) {
      throw new Error(`配置 ${key} 必须是字符串数组。`);
    }
  }
  if (!config.featuredRepositories.every((name) => /^[a-z\d_.-]+$/i.test(name))) {
    throw new Error('精选仓库名称无效。');
  }
  for (const feed of config.rssFeeds) {
    if (new URL(feed).protocol !== 'https:') throw new Error('RSS 地址必须使用 HTTPS。');
  }
  for (const key of ['focus', 'learning', 'workingOn']) {
    if (typeof config[key] !== 'string') throw new Error(`配置 ${key} 必须是字符串。`);
  }
  return config;
}

function renderFeaturedCard(repo) {
  return `### [${escapeMarkdown(repo.full_name || repo.name)}](${repo.html_url})\n\n${escapeMarkdown(repo.description) || '暂未填写仓库简介。'}\n\n**${escapeMarkdown(repo.language) || '资料 / 文档'}** · ⭐ ${repo.stargazers_count} · Forks ${repo.forks_count ?? 0}`;
}

export function renderFeatured(repositories, names) {
  if (!names.length) return '尚未配置精选项目。';
  return names.map((name) => {
    const repo = repositories.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!repo) throw new Error(`精选仓库 ${name} 不存在或不是此账号的公开仓库。`);
    return renderFeaturedCard(repo);
  }).join('\n\n');
}

export async function fetchPinnedRepositories(username, token, graphql = (body) => githubRequest('/graphql', token, fetch, body)) {
  if (!token) throw new Error('读取 GitHub 置顶仓库需要 GITHUB_TOKEN。');
  const result = await graphql({
    query: 'query($login: String!) { user(login: $login) { pinnedItems(first: 6, types: REPOSITORY) { nodes { ... on Repository { name nameWithOwner url description primaryLanguage { name } stargazerCount forkCount isPrivate } } } } }',
    variables: { login: username },
  });
  if (result.errors?.length) {
    throw new Error(`置顶仓库请求失败：${result.errors.map((error) => error.message).join('; ')}`);
  }
  const nodes = result.data?.user?.pinnedItems?.nodes;
  if (!Array.isArray(nodes) || nodes.some((node) => !node || typeof node.isPrivate !== 'boolean' ||
    typeof node.nameWithOwner !== 'string' || typeof node.url !== 'string' ||
    !Number.isInteger(node.stargazerCount) || !Number.isInteger(node.forkCount))) {
    throw new Error('GitHub GraphQL 未返回有效的置顶仓库列表。');
  }
  return nodes.filter((repo) => !repo.isPrivate).map((repo) => ({
    name: repo.name,
    full_name: repo.nameWithOwner,
    html_url: repo.url,
    description: repo.description,
    language: repo.primaryLanguage?.name ?? null,
    stargazers_count: repo.stargazerCount,
    forks_count: repo.forkCount,
  }));
}

export function renderPinnedRepositories(repositories) {
  return repositories.length
    ? '跟随 GitHub 主页置顶仓库，按置顶顺序展示。\n\n' + repositories.map(renderFeaturedCard).join('\n\n')
    : 'GitHub 主页暂无公开置顶仓库。可在主页 Customize your pins 中设置。';
}

export function renderRecent(repositories) {
  const recent = repositories.filter((repo) => !repo.fork && !repo.archived && repo.pushed_at)
    .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at) || a.name.localeCompare(b.name))
    .slice(0, 3);
  return recent.length ? recent.map((repo) =>
    `- **[${escapeMarkdown(repo.name)}](${repo.html_url})** · 最近推送 ${repo.pushed_at.slice(0, 10)}\n  ${escapeMarkdown(repo.description) || '暂未填写仓库简介。'}`).join('\n')
    : '暂无可展示的近期维护项目。';
}

export function renderReleases(releases) {
  const recent = releases.filter((release) => !release.draft && !release.prerelease && release.published_at)
    .sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, 5);
  return recent.length ? recent.map((release) =>
    `- ${release.published_at.slice(0, 10)} · **${escapeMarkdown(release.repository)}** · [${escapeMarkdown(release.tag_name)}](${release.html_url})`).join('\n')
    : '公开原创仓库暂无正式 Release。';
}

export async function fetchContributionData(username, token, graphql = (body) => githubRequest('/graphql', token, fetch, body)) {
  if (!token) return null;
  const data = await graphql({
    query: 'query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } commitContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner } contributions(first: 100) { nodes { occurredAt commitCount } } } } } }',
    variables: { login: username },
  });
  if (data.errors?.length) throw new Error(`贡献数据请求失败：${data.errors.map((error) => error.message).join('; ')}`);
  const collection = data.data?.user?.contributionsCollection;
  const calendar = collection?.contributionCalendar;
  if (!calendar) throw new Error('GitHub GraphQL 未返回贡献日历。');
  const dailyTotal = calendar.weeks.flatMap((week) => week.contributionDays)
    .reduce((sum, day) => sum + day.contributionCount, 0);
  if (dailyTotal !== calendar.totalContributions) {
    throw new Error(`贡献日历总数 ${calendar.totalContributions} 与每日合计 ${dailyTotal} 不一致。`);
  }
  const repositories = collection.commitContributionsByRepository;
  if (!Array.isArray(repositories)) throw new Error('GitHub GraphQL 未返回每周提交统计。');
  const commits = repositories.flatMap((repository) => {
    if (!Array.isArray(repository.contributions?.nodes)) {
      throw new Error('GitHub GraphQL 返回了无效的提交贡献记录。');
    }
    return repository.contributions.nodes;
  });
  for (const contribution of commits) {
    if (
      typeof contribution.occurredAt !== 'string' ||
      !Number.isFinite(Date.parse(contribution.occurredAt)) ||
      !Number.isInteger(contribution.commitCount) ||
      contribution.commitCount < 0
    ) {
      throw new Error('GitHub GraphQL 返回了无效的提交贡献记录。');
    }
  }
  return { calendar, commits };
}

export async function fetchCalendar(username, token, graphql) {
  const data = await fetchContributionData(username, token, graphql);
  return data?.calendar ?? null;
}

export function parseFeed(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('RSS 不允许 DTD 或实体声明。');
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`RSS XML 无效：${validation.err.msg}`);
  const parsed = new XMLParser({ ignoreAttributes: false, trimValues: true }).parse(xml);
  const atom = Object.hasOwn(parsed, 'feed');
  const raw = atom ? parsed.feed.entry : parsed.rss?.channel?.item;
  if (!atom && !Object.hasOwn(parsed.rss ?? {}, 'channel')) throw new Error('仅支持 RSS 2.0 或 Atom 源。');
  const items = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return items.map((item) => {
    const links = Array.isArray(item.link) ? item.link : [item.link];
    const link = atom
      ? links.find((entry) => entry && (!entry['@_rel'] || entry['@_rel'] === 'alternate'))?.['@_href']
      : item.link;
    const title = typeof item.title === 'object' ? item.title['#text'] : item.title;
    const date = item.pubDate || item.published || item.updated;
    const timestamp = date ? Date.parse(date) : null;
    if (!title || typeof link !== 'string' || !['https:', 'http:'].includes(new URL(link).protocol)) {
      throw new Error('RSS 文章缺少有效标题或 HTTP(S) 链接。');
    }
    if (date && !Number.isFinite(timestamp)) throw new Error('RSS 文章日期无效。');
    return { title: String(title), link: new URL(link).href, timestamp };
  });
}

export async function fetchArticles(feeds, fetchImpl = fetch) {
  const articles = [];
  for (const feed of feeds) {
    const response = await fetchImpl(feed, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`RSS 请求失败：HTTP ${response.status} (${feed})`);
    const xml = await response.text();
    if (Buffer.byteLength(xml) > 2_000_000) throw new Error('RSS 源超过 2 MB 限制。');
    articles.push(...parseFeed(xml));
  }
  const unique = [...new Map(articles.map((article) => [article.link, article])).values()];
  return unique.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, 5);
}

export function renderBlog(articles, configured) {
  if (!configured) return '尚未配置博客 RSS。添加 `profile.config.json` 中的 `rssFeeds` 后，这里将自动展示最新文章。';
  return articles.length ? articles.map((article) =>
    `- ${article.timestamp ? new Date(article.timestamp).toISOString().slice(0, 10) : '未提供日期'} · [${escapeMarkdown(article.title)}](<${article.link.replace(/>/g, '%3E')}>)`).join('\n')
    : '已配置的博客源暂无文章。';
}

async function writeChanged(path, content) {
  let previous;
  try {
    previous = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous === content) return false;
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return true;
}

export async function updateReadme({
  username = process.env.PROFILE_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || 'luskyle',
  token = process.env.GITHUB_TOKEN,
  readmePath = defaultReadme,
  contributionsToken = process.env.CONTRIBUTIONS_TOKEN || token,
  request = (path) => githubRequest(path, token),
  configPath = defaultConfig,
  config,
  graphql,
  pinnedGraphql,
  feedFetch = fetch,
  now = () => new Date(),
} = {}) {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) {
    throw new Error('PROFILE_USERNAME 不是有效的 GitHub 用户名。');
  }
  config = validateConfig(config ?? JSON.parse(await readFile(configPath, 'utf8')));
  const readme = await readFile(readmePath, 'utf8');
  // Validate markers before making API requests or changing the file.
  for (const name of sectionNames) {
    replaceSection(readme, name, '');
  }
  const user = await request(`/users/${username}`);
  const repositories = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(`/users/${username}/repos?type=owner&per_page=100&page=${page}`);
    repositories.push(...batch);
    if (batch.length < 100) break;
  }
  const releases = [];
  for (const repo of repositories.filter((item) => !item.fork)) {
    const batch = await request(`/repos/${username}/${encodeURIComponent(repo.name)}/releases?per_page=5`);
    releases.push(...batch.map((release) => ({ ...release, repository: repo.name })));
  }
  const contributionData = await fetchContributionData(username, contributionsToken, graphql);
  const calendar = contributionData?.calendar ?? null;
  const pinned = config.featuredSource === 'pinned'
    ? await fetchPinnedRepositories(username, token, pinnedGraphql)
    : null;
  const articles = await fetchArticles(config.rssFeeds, feedFetch);
  const sections = {
    PROFILE: renderProfile(user, repositories),
    REPOSITORIES: renderRepositories(repositories),
    FEATURED: pinned === null
      ? renderFeatured(repositories, config.featuredRepositories)
      : renderPinnedRepositories(pinned),
    RECENT: renderRecent(repositories),
    RELEASES: renderReleases(releases),
    BLOG: renderBlog(articles, config.rssFeeds.length > 0),
    CONTRIBUTIONS: calendar
      ? '![过去一年贡献蛇动画](./assets/snake.svg)'
      : '未配置 `GITHUB_TOKEN` 或 `CONTRIBUTIONS_TOKEN`，无法生成贡献蛇动画。工作流会使用自带 Token 自动生成；本地请通过环境变量提供 Token。',
    COMMITS: calendar
      ? '![过去一年每周提交频率折线图](./assets/commits.svg)'
      : '未配置 `GITHUB_TOKEN` 或 `CONTRIBUTIONS_TOKEN`，无法生成每周提交频率图。',
    ABOUT: `- **关注方向：** ${escapeMarkdown(config.focus) || '待补充'}\n- **正在做：** ${escapeMarkdown(config.workingOn) || '维护下方列出的公开项目；具体计划待补充。'}\n- **正在学：** ${escapeMarkdown(config.learning) || '待补充（不根据仓库语言推断学习计划）。'}`,
    CONTACT: `[GitHub · ${escapeMarkdown(user.login)}](https://github.com/${user.login})` +
      (user.email ? ` · [公开邮箱](mailto:${encodeURIComponent(user.email)})` : '') +
      (user.blog && /^https?:\/\//i.test(user.blog) ? ` · [个人网站](<${new URL(user.blog).href}>)` : ''),
    DOCUMENT_UPDATED: `文档更新时间：${now().toISOString().slice(0, 10)}（UTC）`,
  };
  let updated = readme;
  for (const [name, content] of Object.entries(sections)) updated = replaceSection(updated, name, content);
  const assets = renderAssets(user, repositories, calendar, contributionData?.commits ?? []);
  const assetsPath = join(dirname(readmePath), 'assets');
  await mkdir(assetsPath, { recursive: true });
  let changed = false;
  for (const [name, content] of Object.entries(assets)) {
    changed = await writeChanged(join(assetsPath, name), content) || changed;
  }
  return await writeChanged(readmePath, updated) || changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const changed = await updateReadme();
    console.log(changed ? 'README 动态区域已更新。' : '数据未变化，无需更新。');
  } catch (error) {
    console.error('README 更新失败：', error);
    process.exitCode = 1;
  }
}

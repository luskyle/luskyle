export function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function svg(title, description, width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${escapeXml(title)}</title><desc id="desc">${escapeXml(description)}</desc>
<rect width="${width}" height="${height}" rx="20" fill="#0f172a"/>
<g font-family="Arial, sans-serif" fill="#e2e8f0">${body}</g>
</svg>\n`;
}

function text(x, y, value, size = 14, fill = '#e2e8f0') {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}">${escapeXml(value)}</text>`;
}

export function renderStats(user, repositories) {
  const stars = repositories.filter((repo) => !repo.fork)
    .reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const entries = [
    ['公开仓库', user.public_repos, '#38bdf8', 'M4 3h12v18H4zM8 7h4M8 11h4M8 15h4M16 8h4v13h-4'],
    ['原创仓库获星', stars, '#a78bfa', 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z'],
    ['关注者', user.followers, '#34d399', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87'],
    ['正在关注', user.following, '#fbbf24', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 8h6M20 5v6'],
  ];
  const cards = entries.map(([label, value, color, icon], index) => {
    const x = 24 + index * 232;
    const valueSize = Math.min(38, 170 / Math.max(1, String(value).length) / 0.65);
    return `<g transform="translate(${x} 76)">` +
      `<rect width="216" height="132" rx="14" fill="#162238" stroke="#29384e"/>` +
      `<rect x="16" y="18" width="36" height="36" rx="10" fill="${color}" fill-opacity=".12"/>` +
      `<path transform="translate(22 24)" d="${icon}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
      text(16, 94, value, valueSize) + text(16, 116, label, 12, '#94a3b8') +
      `</g>`;
  }).join('');
  return svg('GitHub 概览', entries.map(([label, value]) => `${label}: ${value}`).join('; '),
    960, 232, text(24, 35, 'GitHub 概览', 21) +
    text(24, 57, '公开资料 · 获星数统计原创仓库，包含已归档仓库', 12, '#94a3b8') + cards);
}

export function flattenDays(calendar) {
  return calendar.weeks.flatMap((week) => week.contributionDays);
}

export function contributionStreaks(calendar) {
  const days = flattenDays(calendar);
  let longest = 0;
  let running = 0;
  for (const day of days) {
    running = day.contributionCount > 0 ? running + 1 : 0;
    longest = Math.max(longest, running);
  }
  // Today can still receive contributions; yesterday's streak remains active.
  let index = days.length - 1;
  if (index >= 0 && days[index].contributionCount === 0) index -= 1;
  let current = 0;
  while (index >= 0 && days[index--].contributionCount > 0) current += 1;
  return { current, longest };
}

export function renderSnake(calendar) {
  const days = flattenDays(calendar);
  const maximum = Math.max(1, ...days.map((day) => day.contributionCount));
  const width = Math.max(640, calendar.weeks.length * 16 + 70);
  const points = [];
  const cells = calendar.weeks.map((week, column) =>
    week.contributionDays.map((day) => {
      const x = 35 + column * 16;
      const y = 85 + new Date(`${day.date}T00:00:00Z`).getUTCDay() * 16;
      const level = day.contributionCount === 0 ? 0 : Math.min(4, Math.ceil(day.contributionCount / maximum * 4));
      if (level > 0) points.push([x + 6, y + 6]);
      return `<rect x="${x}" y="${y}" width="12" height="12" rx="3" fill="${['#1e293b', '#064e3b', '#059669', '#34d399', '#a7f3d0'][level]}"><title>${escapeXml(day.date)}: ${day.contributionCount} contributions</title></rect>`;
    }).join('')).join('');
  const { current, longest } = contributionStreaks(calendar);
  const title = 'Contribution Snake';
  const path = points.slice(-40).map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const animation = points.length > 1
    ? Array.from({ length: 6 }, (_, index) =>
      `<circle r="${index === 5 ? 5 : 3.5}" fill="${index === 5 ? '#fbbf24' : '#38bdf8'}" opacity="${0.3 + index * 0.14}"><animateMotion begin="-${index * 0.12}s" dur="16s" repeatCount="indefinite" path="${path}"/></circle>`).join('')
    : '';
  const dateRange = `${days[0]?.date ?? ''} — ${days.at(-1)?.date ?? ''}`;
  return svg(title, `${calendar.totalContributions} token-visible contributions. Current streak ${current} days; longest ${longest} days. Date range: ${dateRange}. Private contributions depend on token access. Animation follows recent active cells, not commit order.`,
    width, 245, text(24, 35, title, 21) +
    text(24, 60, `${calendar.totalContributions} token-visible contributions · current ${current}d · longest ${longest}d`, 13, '#94a3b8') +
    cells + animation + text(24, 225, `${dateRange} · animated contribution history`, 12, '#94a3b8'));
}

export function renderWeeklyCommits(contributions, calendar) {
  const days = flattenDays(calendar);
  const today = new Date().toISOString().slice(0, 10);
  const firstDate = days[0]?.date ?? today;
  const lastDate = days.at(-1)?.date ?? today;
  const startOfWeek = (date) => {
    const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - value.getUTCDay());
    return value.toISOString().slice(0, 10);
  };
  const firstWeek = new Date(`${startOfWeek(firstDate)}T00:00:00Z`);
  const lastWeek = new Date(`${startOfWeek(lastDate)}T00:00:00Z`);
  const weekCount = Math.round((lastWeek - firstWeek) / 604_800_000) + 1;
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const date = new Date(firstWeek);
    date.setUTCDate(date.getUTCDate() + index * 7);
    return date.toISOString().slice(0, 10);
  });
  const totals = new Map(weeks.map((week) => [week, 0]));
  for (const contribution of contributions) {
    const week = startOfWeek(contribution.occurredAt);
    if (totals.has(week)) totals.set(week, totals.get(week) + contribution.commitCount);
  }
  const values = weeks.map((week) => totals.get(week));
  const max = Math.max(1, ...values);
  const width = 960;
  const left = 54;
  const right = width - 24;
  const top = 82;
  const bottom = 238;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? (left + right) / 2 : left + index * (right - left) / (values.length - 1);
    const y = bottom - value / max * (bottom - top);
    return [x, y];
  });
  const grid = Array.from({ length: 4 }, (_, index) => {
    const y = top + index * (bottom - top) / 3;
    const value = Math.round(max * (3 - index) / 3);
    return `<path d="M${left} ${y}H${right}" stroke="#334155" stroke-width="1"/>` +
      text(16, y + 4, value, 10, '#94a3b8');
  }).join('');
  const line = points.map(([x, y], index) => {
    if (index === 0) return `M${x},${y}`;
    const [previousX, previousY] = points[index - 1];
    const midpointX = (previousX + x) / 2;
    return `C${midpointX},${previousY} ${midpointX},${y} ${x},${y}`;
  }).join(' ');
  const area = `${line} L${points.at(-1)[0]},${bottom} L${points[0][0]},${bottom} Z`;
  const markers = points.map(([x, y], index) =>
    `<circle cx="${x}" cy="${y}" r="2.5" fill="#38bdf8"><title>${weeks[index]} 当周：${values[index]} 次提交</title></circle>`).join('');
  const labels = weeks.map((week, index) => {
    const month = week.slice(0, 7);
    if (index > 0 && month === weeks[index - 1].slice(0, 7)) return '';
    const [x] = points[index];
    return text(x, 263, month, 10, '#94a3b8');
  }).join('');
  return svg('每周提交频率',
    `按周汇总 GitHub 贡献图中的提交数，统计最多 100 个仓库的默认分支贡献。${firstDate} 至 ${lastDate}。`,
    width, 286,
    text(24, 35, '每周提交频率', 21) +
    text(24, 59, `默认分支提交数 · ${firstDate} — ${lastDate}`, 12, '#94a3b8') +
    `<defs><linearGradient id="commit-area" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#a78bfa" stop-opacity=".55"/><stop offset="1" stop-color="#34d399" stop-opacity=".08"/>` +
    `</linearGradient></defs>` +
    grid + `<path d="${area}" fill="url(#commit-area)"/>` +
    `<path d="${line}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    markers + labels);
}

export function renderAssets(user, repositories, calendar, weeklyCommits) {
  return {
    'stats.svg': renderStats(user, repositories),
    ...(calendar ? {
      'commits.svg': renderWeeklyCommits(weeklyCommits, calendar),
      'snake.svg': renderSnake(calendar),
    } : {}),
  };
}

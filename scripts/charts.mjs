export function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

const colors = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#c084fc', '#94a3b8'];

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

export function renderBars(title, subtitle, entries) {
  const rows = entries.slice(0, 8);
  const max = Math.max(1, ...rows.map(([, value]) => value));
  const body = rows.map(([label, value], index) => {
    const y = 85 + index * 34;
    const width = Math.round(value / max * 360);
    return text(24, y + 15, label) +
      `<rect x="170" y="${y}" width="${width}" height="20" rx="5" fill="${colors[index]}"/>` +
      text(545, y + 15, value);
  }).join('');
  return svg(title, entries.map(([label, value]) => `${label}: ${value}`).join('; '),
    640, Math.max(145, 110 + rows.length * 34),
    text(24, 35, title, 21) + text(24, 60, subtitle, 12, '#94a3b8') +
    (rows.length ? body : text(24, 100, 'No public data available')));
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
    `<circle cx="${x}" cy="${y}" r="2.5" fill="#38bdf8"><title>Week of ${weeks[index]}: ${values[index]} commits</title></circle>`).join('');
  const labels = weeks.map((week, index) => {
    const month = week.slice(0, 7);
    if (index > 0 && month === weeks[index - 1].slice(0, 7)) return '';
    const [x] = points[index];
    return text(x, 263, month, 10, '#94a3b8');
  }).join('');
  return svg('Weekly Commit Frequency',
    `Commits by week on GitHub's contribution graph. Default-branch contributions across up to 100 repositories. ${firstDate} through ${lastDate}.`,
    width, 286,
    text(24, 35, 'Weekly Commit Frequency', 21) +
    text(24, 59, `Default-branch commits · ${firstDate} — ${lastDate}`, 12, '#94a3b8') +
    `<defs><linearGradient id="commit-area" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#a78bfa" stop-opacity=".55"/><stop offset="1" stop-color="#34d399" stop-opacity=".08"/>` +
    `</linearGradient></defs>` +
    grid + `<path d="${area}" fill="url(#commit-area)"/>` +
    `<path d="${line}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    markers + labels);
}

export function renderAssets(user, repositories, calendar, weeklyCommits) {
  const original = repositories.filter((repo) => !repo.fork);
  return {
    'stats.svg': renderBars('GitHub Overview', 'Public data · original repositories exclude forks', [
      ['Public repos', user.public_repos], ['Followers', user.followers], ['Following', user.following],
      ['Original stars', original.reduce((sum, repo) => sum + repo.stargazers_count, 0)],
    ]),
    ...(calendar ? {
      'commits.svg': renderWeeklyCommits(weeklyCommits, calendar),
      'snake.svg': renderSnake(calendar),
    } : {}),
  };
}

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

export function renderCalendar(calendar, animated = false) {
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
  const title = animated ? 'Contribution Snake' : 'Contribution Calendar';
  const path = points.slice(-40).map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const animation = animated && points.length > 1
    ? Array.from({ length: 6 }, (_, index) =>
      `<circle r="${index === 5 ? 5 : 3.5}" fill="${index === 5 ? '#fbbf24' : '#38bdf8'}" opacity="${0.3 + index * 0.14}"><animateMotion begin="-${index * 0.12}s" dur="16s" repeatCount="indefinite" path="${path}"/></circle>`).join('')
    : '';
  return svg(title, `${calendar.totalContributions} contributions. Current streak ${current} days; longest ${longest} days. Animation follows recent active cells, not commit order.`,
    width, 245, text(24, 35, title, 21) +
    text(24, 60, `${calendar.totalContributions} contributions · current streak ${current}d · longest ${longest}d`, 13, '#94a3b8') +
    cells + animation + text(24, 225, animated
      ? 'Animated trail through recent active days · decorative, not commit order'
      : `${days[0]?.date ?? ''} — ${days.at(-1)?.date ?? ''} · GitHub contribution counts`, 12, '#94a3b8'));
}

export function renderAssets(user, repositories, events, calendar, config) {
  const original = repositories.filter((repo) => !repo.fork);
  const languages = new Map();
  for (const repo of original) {
    if (repo.language) languages.set(repo.language, (languages.get(repo.language) ?? 0) + 1);
  }
  const latest = events.filter((event) => event.public).map((event) => event.created_at).sort().at(-1);
  const end = latest ? new Date(latest) : null;
  const weeks = Array(4).fill(0);
  for (const event of events.filter((item) => item.public)) {
    const age = end ? Math.floor((end - new Date(event.created_at)) / 86_400_000) : 0;
    if (age >= 0 && age < 28) weeks[3 - Math.floor(age / 7)] += 1;
  }
  const labels = ['Days 22–28', 'Days 15–21', 'Days 8–14', 'Days 1–7'];
  return {
    'banner.svg': svg(`Hello, ${user.name || user.login}`, 'Open source projects, tools and experiments', 960, 210,
      `<circle cx="870" cy="100" r="70" fill="#1e293b"/><circle cx="870" cy="100" r="45" fill="none" stroke="#38bdf8" stroke-width="3"/>` +
      text(36, 75, `Hi, I'm ${user.name || user.login}`, 38) +
      `<defs><clipPath id="typing"><rect x="36" y="95" width="520" height="35"><animate attributeName="width" values="0;520;520;0" keyTimes="0;0.45;0.85;1" dur="8s" repeatCount="indefinite"/></rect></clipPath></defs>` +
      `<g clip-path="url(#typing)">${text(36, 120, 'BUILD · SHARE · KEEP EXPLORING', 19, '#38bdf8')}</g>` +
      text(36, 165, 'Open source / Developer tools / Browser extensions', 16, '#94a3b8') +
      `<rect x="36" y="181" width="10" height="4" fill="#34d399"><animate attributeName="width" values="10;520;10" dur="8s" repeatCount="indefinite"/></rect>`),
    'stack.svg': svg('Technology Toolbox', config.technologyLabels.join(', '), 960, 105,
      config.technologyLabels.map((label, index) =>
        `<rect x="${20 + index * 153}" y="30" width="142" height="45" rx="12" fill="#1e293b"/>` +
        text(30 + index * 153, 58, label, 14, colors[index % colors.length])).join('')),
    'stats.svg': renderBars('GitHub Overview', 'Public data · original repositories exclude forks', [
      ['Public repos', user.public_repos], ['Followers', user.followers], ['Following', user.following],
      ['Original stars', original.reduce((sum, repo) => sum + repo.stargazers_count, 0)],
    ]),
    'languages.svg': renderBars('Language Distribution', 'Number of original repos by primary language · not code bytes',
      [...languages].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    'activity.svg': renderBars('Public Activity', `28 days ending ${latest?.slice(0, 10) ?? 'N/A'} · sampled Events API, not commits`,
      labels.map((label, i) => [label, weeks[i]])),
    ...(calendar ? { 'contributions.svg': renderCalendar(calendar), 'snake.svg': renderCalendar(calendar, true) } : {}),
  };
}

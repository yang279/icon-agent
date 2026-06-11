const fs = require('fs');
const path = require('path');

const ICONS_PATH = path.resolve(__dirname, '../iconJson/icons.json');

const iconsData = JSON.parse(fs.readFileSync(ICONS_PATH, 'utf-8'));
const iconMap = new Map(iconsData.map(i => [i.id, i]));

function findIcon(keyword, attempt) {
  const direct = iconMap.get(keyword);
  if (direct) return { icon: direct, exact: true };

  const matches = [];
  for (const icon of iconsData) {
    if (icon.name === keyword) {
      return { icon, exact: true };
    }
    if (icon.name.includes(keyword) || keyword.includes(icon.name)) {
      const score = Math.min(icon.name.length, keyword.length) / Math.max(icon.name.length, keyword.length);
      matches.push({ icon, score });
    }
  }

  if (matches.length === 0) return { icon: null, exact: false };

  matches.sort((a, b) => b.score - a.score);

  const idx = Math.min(attempt - 1, matches.length - 1);
  return { icon: matches[idx].icon, exact: false, totalMatches: matches.length, attempt };
}

module.exports = { findIcon, iconsData };
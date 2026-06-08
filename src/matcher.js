const fs = require('fs');
const path = require('path');

const ICONS_PATH = path.resolve(__dirname, '../iconJson/icons.json');

const iconsData = JSON.parse(fs.readFileSync(ICONS_PATH, 'utf-8'));
const iconMap = new Map(iconsData.map(i => [i.id, i]));

function findIcon(keyword) {
  const direct = iconMap.get(keyword);
  if (direct) return direct;

  let bestMatch = null;
  let bestScore = 0;
  for (const icon of iconsData) {
    if (icon.name === keyword) {
      return icon;
    }
    if (icon.name.includes(keyword) || keyword.includes(icon.name)) {
      const score = Math.min(icon.name.length, keyword.length) / Math.max(icon.name.length, keyword.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = icon;
      }
    }
  }
  return bestMatch;
}

module.exports = { findIcon, iconsData };
function modifySvg(svg, size, colorValue, stroke, style) {
  let result = svg;

  if (size) {
    result = result.replace(/viewBox="0 0 \d+ \d+"/, `viewBox="0 0 ${size} ${size}"`);
    result = result.replace(/(<svg[^>]*)(>)/, `$1 width="${size}" height="${size}"$2`);
  }

  if (stroke) {
    result = result.replace(/stroke-width="[^"]*"/, `stroke-width="${stroke}"`);
    if (!result.includes('stroke-width')) {
      result = result.replace(/(<svg[^>]*)(>)/, `$1 stroke-width="${stroke}"$2`);
    }
  }

  if (colorValue) {
    const colors = colorValue.split(',');
    if (colors.length === 1) {
      result = result.replace(/stroke="currentColor"/g, `stroke="${colors[0]}"`);
      result = result.replace(/fill="currentColor"/g, `fill="${colors[0]}"`);
      result = result.replace(/fill="none"/g, `fill="${colors[0]}"`);
    } else if (colors.length >= 2) {
      if (style === '线性双色' || style === '面性双色') {
        result = result.replace(/stroke="currentColor"/g, `stroke="${colors[0]}"`);
        result = result.replace(/fill="currentColor"/g, `fill="${colors[1]}"`);
      } else if (style === '圆底托' || style === '方底托') {
        if (colors.length >= 3) {
          result = result.replace(/stroke="currentColor"/g, `stroke="${colors[0]}"`);
          result = result.replace(/fill="currentColor"/g, `fill="${colors[1]}"`);
        }
      }
    }
  }

  return result;
}

module.exports = modifySvg;
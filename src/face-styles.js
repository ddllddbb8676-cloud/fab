export const EYE_STYLES = ['eyes-default', 'eyes-round', 'eyes-smile', 'eyes-sparkle', 'eyes-squeeze', 'eyes-angry', 'eyes-cry', 'eyes-sideeye', 'eyes-flat', 'eyes-wink'];
export function createFacePixels(style = 'eyes-round', size = 256) {
  if (!EYE_STYLES.includes(style)) style = 'eyes-round';
  const pixels = new Uint8Array(size * size * 4);
  const blend = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = (px + .5) / size * 2 - 1, y = (py + .5) / size * 2 - 1;
    let color = [238, 198, 174];
    const blush = Math.exp(-((Math.abs(x) - .55) ** 2 / .028 + (y + .035) ** 2 / .023)) * .38;
    color = blend(color, [224, 137, 130], blush);
    const ex = Math.abs(x) - .33, ey = y - .18;
    if (style === 'eyes-squeeze') {
      if (ex >= -.14 && ex <= .14 && Math.abs(Math.abs(y - .18) - .85 * (ex + .14)) < .025) color = [55, 44, 42];
    } else if (style === 'eyes-flat') {
      if (Math.abs(ex) < .145 && Math.abs(y - .17) < .024) color = [55, 44, 42];
    } else if (style === 'eyes-angry') {
      const lid = .20 + .65 * ex;
      if ((ex / .14) ** 2 + ((y - .15) / .12) ** 2 < 1 && y < lid) {
        color = [251, 246, 236];
        if ((ex / .052) ** 2 + ((y - .13) / .085) ** 2 < 1) color = [58, 43, 38];
      }
      if (Math.abs(ex) < .15 && Math.abs(y - lid) < .018) color = [55, 44, 42];
      if (Math.abs(ex) < .16 && Math.abs(y - (.34 + .70 * ex)) < .026) color = [66, 45, 39];
    } else if (style === 'eyes-sideeye') {
      const lx = x < 0 ? x + .33 : x - .33;
      if (Math.abs(ex) < .15 && Math.abs(y - .16) < .060) {
        color = [250, 247, 238];
        if (((lx - .08) / .040) ** 2 + ((y - .15) / .065) ** 2 < 1) color = [52, 43, 40];
      }
      if (Math.abs(ex) < .155 && Math.abs(y - .222) < .020) color = [55, 44, 42];
      if (Math.abs(ex) < .15 && Math.abs(y - (x < 0 ? .38 : .31)) < .016) color = [74, 55, 47];
    } else if (style === 'eyes-cry') {
      const sadArc = .13 - .10 * (1 - (ex / .145) ** 2);
      if (Math.abs(ex) < .15 && Math.abs(y - sadArc) < .025) color = [55, 44, 42];
      if (Math.abs(ex) < .15 && Math.abs(y - (.39 - .50 * ex)) < .018) color = [80, 58, 48];
    } else if (style === 'eyes-smile' || (style === 'eyes-wink' && x > 0)) {
      const arch = .12 + .13 * (1 - (ex / .145) ** 2);
      if (Math.abs(ex) < .15 && Math.abs(y - arch) < .024) color = [55, 44, 42];
    } else {
      const rx = style === 'eyes-default' ? .074 : style === 'eyes-sparkle' ? .135 : .12;
      const ry = style === 'eyes-default' ? .102 : style === 'eyes-sparkle' ? .175 : .155;
      const inside = (ex / rx) ** 2 + (ey / ry) ** 2 < 1;
      if (inside) {
        color = [51, 43, 40];
        if (style === 'eyes-sparkle' && ey < -.02) color = blend(color, [127, 91, 64], Math.min(.85, -ey * 5));
        const highlightX = x > 0 ? ex + rx * .28 : ex - rx * .28;
        if ((highlightX / (rx * .32)) ** 2 + ((ey - ry * .38) / (ry * .28)) ** 2 < 1) color = [255, 252, 240];
        if (style === 'eyes-sparkle' && ((ex - rx * .27) / .020) ** 2 + ((ey + ry * .42) / .024) ** 2 < 1) color = [255, 244, 220];
      }
    }
    // A larger mask reaches toward both cheeks and covers the lower face.
    const top = -.16 + .06 * Math.exp(-x * x / .08), bottom = -.82 + .16 * x * x;
    const width = .83 - .07 * ((y + .3) / .6) ** 2;
    const masked = y < top && y > bottom && Math.abs(x) < width;
    const strap = Math.abs(x) > .78 && (Math.abs(y + .23 + (Math.abs(x) - .8) * .10) < .014 || Math.abs(y + .60 - (Math.abs(x) - .8) * .12) < .014);
    if (strap) color = [221, 232, 232];
    if (masked) {
      color = [239, 246, 243];
      if (top - y < .016 || y - bottom < .016 || width - Math.abs(x) < .014) color = [182, 204, 207];
      for (const fold of [-.36, -.51, -.65]) if (Math.abs(y - (fold + .035 * x * x)) < .007) color = [215, 229, 229];
    }
    if (style === 'eyes-cry' && y < .10 && y > -.64) {
      const tearX = Math.abs(x) - (.46 + .013 * Math.sin(y * 8));
      const tearWidth = .048 * Math.min(1, (.10 - y) * 18, (y + .64) * 18);
      if (Math.abs(tearX) < tearWidth) color = Math.abs(tearX + .016) < .008 ? [213, 245, 250] : [119, 199, 224];
    }
    const index = (py * size + px) * 4;
    pixels[index] = color[0]; pixels[index + 1] = color[1]; pixels[index + 2] = color[2]; pixels[index + 3] = 255;
  }
  return pixels;
}

const sharp = require(process.argv[2]);
const out = process.argv[3];
const ORANGE = '#ea580c', DARK = '#c2410c', CREAM = '#fff7ed';
// A price tag (pointing left, with a hole) and a "%" drawn with shapes, on a 1024 canvas, rotated -40°.
const tag = (fill, mark, { hole = true } = {}) => `
  <g transform="rotate(-30 512 512)">
    <path d="M 210 512 L 370 330 L 790 330 Q 830 330 830 370 L 830 654 Q 830 694 790 694 L 370 694 Z"
          fill="${fill}" stroke="${fill}" stroke-width="28" stroke-linejoin="round"/>
  </g>
  ${mark === 'none' ? '' : `
  <circle cx="478" cy="438" r="40" fill="${mark}"/>
  <circle cx="612" cy="578" r="40" fill="${mark}"/>
  <line x1="624" y1="404" x2="466" y2="612" stroke="${mark}" stroke-width="38" stroke-linecap="round"/>`}`;
const svg = (w, h, body, bg) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}${body}</svg>`);
const scaled = (s, body) => `<g transform="translate(${512 - 512 * s} ${512 - 512 * s}) scale(${s})">${body}</g>`;

(async () => {
  const write = (name, buf, size) => sharp(buf).resize(size, size).png().toFile(`${out}/${name}`);
  // Legacy/launcher icon and Play listing icon: white tag on orange, full bleed.
  await write('icon.png', svg(1024, 1024, scaled(0.92, tag('#ffffff', ORANGE)), ORANGE), 1024);
  await write('play-icon-512.png', svg(1024, 1024, scaled(0.92, tag('#ffffff', ORANGE)), ORANGE), 512);
  // Adaptive icon: Android masks the outer third, so keep the tag inside the centre 60 %.
  await write('android-icon-foreground.png', svg(1024, 1024, scaled(0.62, tag('#ffffff', ORANGE))), 512);
  await write('android-icon-background.png', svg(1024, 1024, '', ORANGE), 512);
  // Monochrome (themed icons): one-colour silhouette, Android tints it.
  await write('android-icon-monochrome.png', svg(1024, 1024, scaled(0.62, tag('#ffffff', 'transparent'))), 432);
  // Splash: orange tag on the white splash background.
  await write('splash-icon.png', svg(1024, 1024, scaled(0.8, tag(ORANGE, '#ffffff'))), 1024);
  // Play feature graphic 1024×500.
  const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ORANGE}"/><stop offset="1" stop-color="${DARK}"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#g)"/>
    <g transform="translate(-10 0) scale(0.48)">${tag('#ffffff', ORANGE)}</g>
    <text x="500" y="225" font-family="DejaVu Sans" font-weight="bold" font-size="96" fill="#ffffff">Dodoom</text>
    <text x="500" y="295" font-family="DejaVu Sans" font-size="32" fill="${CREAM}">Offers from shops near you</text>
    <text x="500" y="345" font-family="DejaVu Sans" font-size="28" fill="${CREAM}">Hubballi · Dharwad</text>
  </svg>`;
  await sharp(Buffer.from(fg)).png().toFile(`${out}/play-feature-graphic.png`);
})().catch((e) => { console.error(e); process.exit(1); });

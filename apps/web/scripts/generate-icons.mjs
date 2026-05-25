#!/usr/bin/env node
/**
 * generate-icons.mjs
 * Converts axon-icon.svg → PNG variants for use as static assets.
 * Requires sharp:  npm install -D sharp   (run once from apps/web/)
 *
 * Usage:  node scripts/generate-icons.mjs
 */

import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');          // apps/web/
const publicDir = join(root, 'public');

const iconSvg = readFileSync(join(publicDir, 'axon-icon.svg'));
const logoSvg = readFileSync(join(publicDir, 'axon-logo.svg'));

mkdirSync(publicDir, { recursive: true });

const icons = [
  { name: 'favicon-16.png',  src: iconSvg, size: 16  },
  { name: 'favicon-32.png',  src: iconSvg, size: 32  },
  { name: 'icon-192.png',    src: iconSvg, size: 192 },
  { name: 'icon-512.png',    src: iconSvg, size: 512 },
  { name: 'apple-icon.png',  src: iconSvg, size: 180 },
];

for (const { name, src, size } of icons) {
  await sharp(src)
    .resize(size, size)
    .png()
    .toFile(join(publicDir, name));
  console.log(`✅  ${name}  (${size}×${size})`);
}

// Wide logo for Navbar / OG use
await sharp(logoSvg)
  .resize(440, 88)
  .png()
  .toFile(join(publicDir, 'logo.png'));
console.log('✅  logo.png  (440×88)');

// OG banner (1200×630) — gradient background + AXON TICKETS text
// Built as an inline SVG so sharp can rasterise without extra deps
const ogSvg = Buffer.from(`
<svg viewBox="0 0 1200 630" width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ogBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#1E0B4B"/>
      <stop offset="55%"  stop-color="#5B21B6"/>
      <stop offset="100%" stop-color="#9333EA"/>
    </linearGradient>
    <radialGradient id="ogGlow" cx="30%" cy="40%" r="55%">
      <stop offset="0%"   stop-color="#C084FC" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#C084FC" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogBg)"/>
  <rect width="1200" height="630" fill="url(#ogGlow)"/>

  <!-- Decorative large A watermark -->
  <polygon points="600,60  180,580  1020,580" fill="white" opacity="0.04"/>
  <polygon points="600,160  280,580  920,580" fill="url(#ogBg)" opacity="0.9"/>

  <!-- Wordmark -->
  <text x="600" y="295"
    font-family="'Arial Black', Impact, sans-serif"
    font-weight="900"
    font-size="148"
    fill="white"
    text-anchor="middle"
    letter-spacing="-4">AXON</text>
  <text x="600" y="380"
    font-family="Arial, sans-serif"
    font-weight="400"
    font-size="52"
    fill="rgba(255,255,255,0.65)"
    text-anchor="middle"
    letter-spacing="18">TICKETS</text>

  <!-- Tagline -->
  <text x="600" y="455"
    font-family="Arial, sans-serif"
    font-weight="400"
    font-size="26"
    fill="rgba(255,255,255,0.45)"
    text-anchor="middle"
    letter-spacing="1">Fast · Secure · Mobile-First Ticketing in the Philippines</text>
</svg>`);

await sharp(ogSvg)
  .resize(1200, 630)
  .png()
  .toFile(join(publicDir, 'og-image.png'));
console.log('✅  og-image.png  (1200×630)');

console.log('\nAll assets generated in apps/web/public/');

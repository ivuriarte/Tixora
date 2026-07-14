import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const cwd = process.cwd();
const htmlPath = path.join(cwd, 'reports/cto-cost-brief/axon_cost_brief.html');
const pdfPath = path.join(cwd, 'reports/cto-cost-brief/Axon_Tickets_Commercialization_Cost_Brief.pdf');
const shotPath = path.join(cwd, 'reports/cto-cost-brief/Axon_Tickets_Commercialization_Cost_Brief_full.png');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});
await page.screenshot({ path: shotPath, fullPage: true });
await browser.close();

console.log(pdfPath);
console.log(shotPath);

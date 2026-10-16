// Шаг 2: JSON -> брендированный HTML/PDF (+ картинка «было / стало» в CLI).
// Использование из CLI: node src/render.js [--data output/report.json] [--source input/invitro-cbc.png] [--out output]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { clinic } from "./clinic.js";
import { renderReport } from "./template.js";

export async function buildReportHtml(report) {
  const qr = await QRCode.toDataURL(clinic.bookingUrl, { margin: 1, width: 300, color: { dark: clinic.colors.primary } });
  return renderReport(report, clinic, qr);
}

const footerTemplate = `<div style="width:100%;font-size:7pt;color:#8a9496;padding:0 14mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial">
  <span>${clinic.name} · ${clinic.phone}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

// Печатает HTML в PDF; возвращает открытую страницу, чтобы CLI мог сделать с нее скриншот
export async function renderPdf(browser, html, pdfPath) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate,
  });
  return { pdf: Buffer.from(pdf), page };
}

async function renderCompare(browser, sourcePath, reportImgPath, outPath) {
  const sourceImg = `data:image/png;base64,${fs.readFileSync(sourcePath).toString("base64")}`;
  const reportImg = `data:image/png;base64,${fs.readFileSync(reportImgPath).toString("base64")}`;
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding: 36px 40px; font-family: Inter, "Segoe UI", Arial, sans-serif; background:#F2F5F5; color:#1B2526; width: 1600px; }
  h1 { margin: 0 0 4px; font-size: 30px; letter-spacing:-.5px; } p.sub { margin:0 0 26px; color:#5F6B6D; font-size: 16px; }
  .cols { display:grid; grid-template-columns: 1fr 64px 1fr; align-items:center; }
  .col h2 { font-size: 17px; margin: 0 0 10px; color:#5F6B6D; text-transform: uppercase; letter-spacing:.6px; }
  .col.after h2 { color:${clinic.colors.primary}; }
  .col img { width:100%; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.12); background:#fff; display:block; }
  .arrow { text-align:center; font-size: 40px; color:${clinic.colors.primary}; }
</style></head><body>
  <h1>Из бланка лаборатории — в понятный отчет за 30 секунд</h1>
  <p class="sub">Объяснения, отклонения, следующий шаг и запись к врачу — в фирменном стиле клиники</p>
  <div class="cols">
    <div class="col"><h2>Было: бланк лаборатории</h2><img src="${sourceImg}"></div>
    <div class="arrow">→</div>
    <div class="col after"><h2>Стало: отчет ${clinic.name}</h2><img src="${reportImg}"></div>
  </div>
</body></html>`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 900, deviceScaleFactor: 1.5 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: outPath, fullPage: true });
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { values: args } = parseArgs({
    options: {
      data: { type: "string", default: "output/report.json" },
      source: { type: "string", default: "input/invitro-cbc.png" },
      out: { type: "string", default: "output" },
    },
  });
  const out = (f) => path.resolve(args.out, f);
  fs.mkdirSync(args.out, { recursive: true });

  const html = await buildReportHtml(JSON.parse(fs.readFileSync(args.data, "utf8")));
  fs.writeFileSync(out("report.html"), html);

  const browser = await puppeteer.launch();
  try {
    const { page } = await renderPdf(browser, html, out("report.pdf"));
    // Первая страница отчета картинкой — для сравнения с исходным бланком
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.screenshot({ path: out("report-page1.png"), clip: { x: 0, y: 0, width: 794, height: 1123 } });
    await renderCompare(browser, args.source, out("report-page1.png"), out("compare.png"));
  } finally {
    await browser.close();
  }
  console.log(`Готово: ${["report.pdf", "report.html", "report-page1.png", "compare.png"].map(out).join("\n       ")}`);
}

// Веб-интерфейс: загрузка бланка -> генерация отчета в фоне -> просмотр и скачивание PDF.
// Запуск: npm start (без API_KEY в .env работает в демо-режиме на data/sample-report.json)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import puppeteer from "puppeteer";
import { clinic } from "./clinic.js";
import { llm } from "./env.js";
import { extractReport, ExtractError, MEDIA_TYPES } from "./extract.js";
import { buildReportHtml, renderPdf } from "./render.js";

const PORT = Number(process.env.PORT ?? 3100);
const DEMO = process.env.DEMO === "1" || !llm.apiKey;
const MAX_MB = 20;
const JOB_TTL_MS = 60 * 60 * 1000;

const sampleReport = JSON.parse(fs.readFileSync("data/sample-report.json", "utf8"));
const allowedTypes = new Set(Object.values(MEDIA_TYPES));

// Задачи живут в памяти: для демо этого достаточно, после перезапуска сервера они пропадают
const jobs = new Map();

let browserPromise;
const getBrowser = () => (browserPromise ??= puppeteer.launch());

async function runJob(job, file) {
  try {
    job.status = "extracting";
    const report = DEMO
      ? await new Promise((resolve) => setTimeout(() => resolve(sampleReport), 2500))
      : await extractReport(file.buffer, file.mimetype);

    job.status = "rendering";
    job.html = await buildReportHtml(report);
    const { pdf, page } = await renderPdf(await getBrowser(), job.html);
    await page.close();
    job.pdf = pdf;
    job.counts = {
      total: report.indicators.length,
      out_of_range: report.indicators.filter((i) => i.status === "low" || i.status === "high").length,
      watch: report.indicators.filter((i) => i.status === "borderline").length,
    };
    job.status = "done";
  } catch (error) {
    console.error(`[job ${job.id}]`, error);
    job.status = "error";
    job.error = error instanceof ExtractError ? error.message : "Не удалось сформировать отчет. Попробуйте еще раз.";
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, allowedTypes.has(file.mimetype)),
});

const app = express();
app.use(express.static("public"));

app.get("/api/config", (req, res) => {
  res.json({ demo: DEMO, maxMb: MAX_MB, clinic: { name: clinic.name, colors: clinic.colors } });
});

app.post("/api/reports", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Загрузите бланк в формате PDF, PNG или JPG." });
  }
  const job = {
    id: crypto.randomUUID(),
    status: "queued",
    fileName: Buffer.from(req.file.originalname, "latin1").toString("utf8"),
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  runJob(job, req.file);
  res.status(202).json({ id: job.id });
});

const findJob = (req, res, next) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Отчет не найден или устарел." });
  req.job = job;
  next();
};
const requireDone = (req, res, next) =>
  req.job.status === "done" ? next() : res.status(409).json({ error: "Отчет еще не готов." });

app.get("/api/reports/:id", findJob, (req, res) => {
  const { id, status, error, fileName, counts } = req.job;
  res.json({ id, status, error, fileName, counts });
});

app.get("/api/reports/:id/view", findJob, requireDone, (req, res) => {
  res.type("html").send(req.job.html);
});

app.get("/api/reports/:id/pdf", findJob, requireDone, (req, res) => {
  const base = path.parse(req.job.fileName).name;
  const name = `Отчет ${clinic.name} — ${base}.pdf`;
  res
    .type("pdf")
    .set("Content-Disposition", `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`)
    .send(req.job.pdf);
});

// Ошибки загрузки (слишком большой файл и т.п.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? `Файл больше ${MAX_MB} МБ.` : "Не удалось загрузить файл.";
    return res.status(400).json({ error: message });
  }
  next(err);
});

setInterval(() => {
  for (const [id, job] of jobs) if (Date.now() - job.createdAt > JOB_TTL_MS) jobs.delete(id);
}, 10 * 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`Открыть: http://localhost:${PORT}${DEMO ? "  (демо-режим: API_KEY не задан)" : `  (модель: ${llm.model})`}`);
});

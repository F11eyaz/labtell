// Шаг 1: бланк анализов (PNG/JPG/PDF) -> структурированный JSON через Claude.
// Использование из CLI: node src/extract.js [путь к бланку] [путь к json]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { reportSchema } from "./schema.js";

const SYSTEM = `Ты — врач клинической лабораторной диагностики. Клиника превентивной медицины
в Казахстане отправляет тебе бланк анализов пациента. Подготовь данные для понятного
пациенту отчета на русском языке.

Пациент должен дочитать отчет и понять каждый показатель без врача рядом, поэтому
объясняй подробно, а не отписками вида «в норме».

Правила:
- Перенеси ВСЕ показатели с бланка. Значения и референсы бери строго с бланка, не подставляй свои нормы.
- status: "low"/"high" только если значение вне референса бланка; "borderline" — внутри, но у самого края.
- Для каждого показателя: what_it_is (что это и зачем) и your_result (что значит именно это значение).
- findings — главная часть отчета. Группируй связанные показатели по смыслу (перенос кислорода,
  иммунитет, воспаление, свертывание и т.д.) и объясняй их сочетание: относительные % против
  абсолютных значений, индексы эритроцитов вместе, и т.п. Это главная ценность по сравнению с голым бланком.
  Каждый показатель должен попасть хотя бы в одну находку. Порядок: out_of_range, затем watch, затем in_range.
- tests_to_add — только анализы, которые уточнят именно эти результаты, с объяснением связи.
- Пиши просто, спокойно, без запугивания и без постановки диагноза. Не назначай лекарства.
- doctor_summary — для врача клиники: термины, цифры, дифференциальный ряд, план дообследования.
- Специалистов указывай так, как они называются в казахстанских клиниках (терапевт, гематолог и т.п.).
- Не включай ФИО и идентификаторы пациента — отчет обезличенный.`;

export const MEDIA_TYPES = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

// Ошибка с текстом, который можно показать пользователю
export class ExtractError extends Error {}

function documentBlock(buffer, mediaType) {
  const data = buffer.toString("base64");
  if (mediaType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: mediaType, data } };
  }
  return { type: "image", source: { type: "base64", media_type: mediaType, data } };
}

let client;

export async function extractReport(buffer, mediaType) {
  client ??= new Anthropic();
  let response;
  try {
    // Ответ длинный (подробные объяснения по каждому показателю) — стримим, чтобы не упереться в таймаут
    const stream = client.beta.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: reportSchema },
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [documentBlock(buffer, mediaType), { type: "text", text: "Разбери этот бланк анализов." }],
        },
      ],
    });
    response = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ExtractError("Нет доступа к API: задайте ANTHROPIC_API_KEY.");
    } else if (error instanceof Anthropic.RateLimitError) {
      throw new ExtractError("Лимит запросов к API, попробуйте через минуту.");
    } else if (error instanceof Anthropic.BadRequestError) {
      throw new ExtractError(`Файл не удалось обработать: ${error.message}`);
    } else if (error instanceof Anthropic.APIError) {
      throw new ExtractError(`Ошибка API ${error.status}, попробуйте позже.`);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new ExtractError("Модель отказалась обрабатывать этот файл.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractError("Ответ модели обрезан — бланк слишком большой.");
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  return JSON.parse(text);
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const inputPath = process.argv[2] ?? "input/invitro-cbc.png";
  const outputPath = process.argv[3] ?? "output/report.json";
  const mediaType = MEDIA_TYPES[path.extname(inputPath).toLowerCase()];
  if (!mediaType) {
    console.error("Поддерживаются PDF, PNG и JPG.");
    process.exit(1);
  }
  try {
    const report = await extractReport(fs.readFileSync(inputPath), mediaType);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`Готово: ${outputPath} (${report.indicators.length} показателей)`);
  } catch (error) {
    if (!(error instanceof ExtractError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

// Шаг 1: бланк анализов (PNG/JPG/PDF) -> структурированный JSON через LLM (Gemini или Claude, см. src/env.js).
// Использование из CLI: node src/extract.js [путь к бланку] [путь к json]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, ApiError, FinishReason } from "@google/genai";
import { llm } from "./env.js";
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

const USER_PROMPT = "Разбери этот бланк анализов.";

export const MEDIA_TYPES = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

// Ошибка с текстом, который можно показать пользователю
export class ExtractError extends Error {}

const NO_ACCESS = "Нет доступа к API: проверьте API_KEY в .env.";
const RATE_LIMIT = "Лимит запросов к API, попробуйте через минуту.";
const REFUSED = "Модель отказалась обрабатывать этот файл.";
const TRUNCATED = "Ответ модели обрезан — бланк слишком большой.";

// --- Gemini ---

let gemini;

async function extractWithGemini(buffer, mediaType) {
  gemini ??= new GoogleGenAI({ apiKey: llm.apiKey });
  let response;
  try {
    response = await gemini.models.generateContent({
      model: llm.model,
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: mediaType, data: buffer.toString("base64") } }, { text: USER_PROMPT }],
        },
      ],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: reportSchema,
        maxOutputTokens: 65536,
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 401 || error.status === 403 || /API key/i.test(error.message)) throw new ExtractError(NO_ACCESS);
    if (error.status === 429) throw new ExtractError(RATE_LIMIT);
    if (error.status === 400) throw new ExtractError(`Файл не удалось обработать: ${error.message}`);
    throw new ExtractError(`Ошибка API ${error.status}, попробуйте позже.`);
  }

  if (response.promptFeedback?.blockReason) throw new ExtractError(REFUSED);
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === FinishReason.MAX_TOKENS) throw new ExtractError(TRUNCATED);
  if (finishReason !== FinishReason.STOP) throw new ExtractError(REFUSED);

  const u = response.usageMetadata ?? {};
  console.log(
    `[${llm.model}] токены: вход ${u.promptTokenCount}, ответ ${u.candidatesTokenCount}, размышления ${u.thoughtsTokenCount ?? 0}`,
  );
  return response.text;
}

// --- Claude ---

function documentBlock(buffer, mediaType) {
  const data = buffer.toString("base64");
  if (mediaType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: mediaType, data } };
  }
  return { type: "image", source: { type: "base64", media_type: mediaType, data } };
}

let anthropic;

async function extractWithClaude(buffer, mediaType) {
  anthropic ??= new Anthropic({ apiKey: llm.apiKey });
  let response;
  try {
    // Ответ длинный (подробные объяснения по каждому показателю) — стримим, чтобы не упереться в таймаут
    const stream = anthropic.beta.messages.stream({
      model: llm.model,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: reportSchema },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: [documentBlock(buffer, mediaType), { type: "text", text: USER_PROMPT }] }],
    });
    response = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new ExtractError(NO_ACCESS);
    if (error instanceof Anthropic.RateLimitError) throw new ExtractError(RATE_LIMIT);
    if (error instanceof Anthropic.BadRequestError) throw new ExtractError(`Файл не удалось обработать: ${error.message}`);
    if (error instanceof Anthropic.APIError) throw new ExtractError(`Ошибка API ${error.status}, попробуйте позже.`);
    throw error;
  }

  if (response.stop_reason === "refusal") throw new ExtractError(REFUSED);
  if (response.stop_reason === "max_tokens") throw new ExtractError(TRUNCATED);
  return response.content.find((b) => b.type === "text")?.text;
}

export async function extractReport(buffer, mediaType) {
  if (!llm.apiKey) throw new ExtractError("Не задан API_KEY в .env.");
  const text =
    llm.provider === "anthropic" ? await extractWithClaude(buffer, mediaType) : await extractWithGemini(buffer, mediaType);
  try {
    return JSON.parse(text);
  } catch {
    throw new ExtractError("Модель вернула некорректный ответ, попробуйте еще раз.");
  }
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
    const started = Date.now();
    const report = await extractReport(fs.readFileSync(inputPath), mediaType);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`Готово за ${seconds} с: ${outputPath} (${report.indicators.length} показателей)`);
  } catch (error) {
    if (!(error instanceof ExtractError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

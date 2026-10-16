# Демо: ИИ-отчет по анализам для клиник

Бланк лаборатории → Claude (JSON) → брендированный HTML → PDF (Puppeteer) + картинка «было / стало».

## Веб-интерфейс

```bash
npm install
npm start                 # http://localhost:3100
```

Загружаете бланк (PDF/PNG/JPG до 20 МБ) → отчет генерируется в фоне → предпросмотр и «Скачать PDF».
Без `ANTHROPIC_API_KEY` сервер работает в **демо-режиме**: вместо распознавания отдает пример из
`data/sample-report.json` (в интерфейсе висит плашка «Демо-режим»). Порт меняется через `PORT`.

## CLI

```bash

# Демо без API-ключа: рендер из готового JSON
npm run demo

# Полный цикл: бланк -> Claude -> JSON -> PDF
export ANTHROPIC_API_KEY=sk-ant-...      # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
npm run all

# Свой бланк (PNG/JPG/PDF)
node src/extract.js path/to/blank.pdf output/report.json
node src/render.js --data output/report.json --source path/to/blank.png
```

## Что получается в `output/`

| Файл | Зачем |
|---|---|
| `report.pdf` | Брендированный отчет: сводка, находки по группам, что досдать, план действий, резюме для врача, справочник по всем показателям |
| `report.html` | Тот же отчет, удобно править верстку в браузере |
| `compare.png` | «Было / стало» — прикладывать к первому сообщению клинике |
| `report.json` | Структурированный результат LLM (только после `npm run all`) |

## Структура

- `src/extract.js` — отправляет бланк в Claude (`claude-opus-5-5`, structured outputs по схеме из `src/schema.js`)
- `src/template.js` — HTML-шаблон: сводка и содержание, 01 вне нормы, 02 стоит понаблюдать, 03 в норме, 04 стоит добавить, 05 план действий + QR, 06 для врача, 07 справочник
- `src/clinic.js` — брендинг выдуманной клиники Qalqan Health: название, цвета, контакты, ссылка записи
- `src/render.js` — HTML → PDF и `compare.png`
- `src/server.js` — Express: `POST /api/reports` (загрузка) → `GET /api/reports/:id` (статус) → `/view`, `/pdf`
- `public/index.html` — страница загрузки, прогресса и скачивания
- `data/sample-report.json` — пример JSON для этого бланка (для демо без ключа)
- `input/invitro-cbc.png` — исходный бланк (пример из открытого доступа)

## Демо под конкретную клинику

Поменяйте в `src/clinic.js` название, цвета, контакты, ссылку WhatsApp (и логотип) и запустите `npm run demo` —
получится персональный отчет «как будто уже от их клиники».

// JSON отчета + брендинг клиники -> HTML (A4, под печать в PDF).

import { logoHtml } from "./clinic.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const STATUS = {
  low: { label: "Ниже нормы", cls: "bad" },
  high: { label: "Выше нормы", cls: "bad" },
  borderline: { label: "У границы", cls: "warn" },
  normal: { label: "Норма", cls: "ok" },
};
const SECTIONS = {
  out_of_range: { title: "Вне нормы", cls: "bad", note: "Вне референсного диапазона — разбираем в первую очередь." },
  watch: { title: "Стоит понаблюдать", cls: "warn", note: "В пределах нормы, но у ее границы." },
  in_range: { title: "В норме", cls: "ok", note: "Ничего необычного — объясняем, что это значит." },
};
const OVERALL = {
  normal: "Все показатели в норме",
  attention: "Есть показатели, требующие внимания",
  urgent: "Нужна консультация врача в ближайшее время",
};
const URGENCY = { routine: "Планово", soon: "В течение 1–2 недель", urgent: "Как можно скорее" };
const SEX = { male: "Мужчина", female: "Женщина", unknown: "" };

const plural = (n, one, few, many) =>
  `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`;
const markers = (n) => plural(n, "показатель", "показателя", "показателей");

// Значение с тем же числом знаков после запятой, что и в референсе бланка (44.0, 5.40)
function fmt(ind) {
  const decimals = ind.ref_text.match(/\d+(?:\.(\d+))?/)?.[1]?.length ?? 0;
  return ind.value.toFixed(decimals).replace(".", ",");
}
const commas = (s) => s.replace(/(\d)\.(\d)/g, "$1,$2");

// Положение значения на шкале: зона нормы занимает 20–80% ширины
function rangeBar(ind) {
  const lo = ind.ref_low ?? 0;
  const hi = ind.ref_high;
  if (hi == null || hi <= lo) return "";
  const zoneStart = ind.ref_low == null ? 0 : 20;
  const pos = zoneStart + ((80 - zoneStart) * (ind.value - lo)) / (hi - lo);
  const clamped = Math.min(97, Math.max(3, pos));
  return `<div class="bar"><div class="zone" style="left:${zoneStart}%;width:${80 - zoneStart}%"></div>
    <div class="dot ${STATUS[ind.status].cls}" style="left:${clamped}%"></div></div>`;
}

const pill = (ind) => `<span class="pill ${STATUS[ind.status].cls}">${STATUS[ind.status].label}</span>`;

// Компактная таблица показателей внутри карточки находки
function markerTable(codes, byCode) {
  const rows = codes
    .map((c) => byCode.get(c))
    .filter(Boolean)
    .map(
      (i) => `<tr>
      <td class="mname">${esc(i.name)} <span class="code">${esc(i.code)}</span></td>
      <td class="val"><b>${fmt(i)}</b> <span class="unit">${esc(i.unit)}</span></td>
      <td class="range">${rangeBar(i)}<div class="ref">норма ${esc(commas(i.ref_text))}</div></td>
      <td class="st">${pill(i)}</td></tr>`,
    )
    .join("");
  return `<table class="mini">${rows}</table>`;
}

function findingCard(f, byCode) {
  const cls = SECTIONS[f.category].cls;
  return `<div class="card finding ${cls}">
    <div class="ftitle"><span class="bullet ${cls}"></span>${esc(f.title)}</div>
    <p>${esc(f.explanation)}</p>
    ${f.what_to_do ? `<div class="todo"><b>Что делать.</b> ${esc(f.what_to_do)}</div>` : ""}
    ${markerTable(f.codes, byCode)}
  </div>`;
}

const sectionHead = (num, title, cls, note) => `
  <div class="shead"><span class="num ${cls}">${num}</span><h2>${title}</h2></div>
  ${note ? `<div class="snote">${note}</div>` : ""}`;

export function renderReport(report, clinic, qrDataUrl) {
  const { patient, indicators, findings, tests_to_add, retest, specialists, lifestyle, doctor_summary } = report;
  const byCode = new Map(indicators.map((i) => [i.code, i]));
  const count = (...st) => indicators.filter((i) => st.includes(i.status)).length;
  const counts = { out_of_range: count("low", "high"), watch: count("borderline"), in_range: count("normal") };
  const c = clinic.colors;
  const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  // Нумерация разделов: пустые разделы находок пропускаем
  const sections = [];
  for (const cat of ["out_of_range", "watch", "in_range"]) {
    const items = findings.filter((f) => f.category === cat);
    if (items.length) sections.push({ key: cat, ...SECTIONS[cat], items, count: markers(counts[cat]) });
  }
  sections.push({ key: "add", title: "Стоит добавить", cls: "info", count: plural(tests_to_add.length, "анализ", "анализа", "анализов") });
  sections.push({ key: "plan", title: "План действий", cls: "info", count: "пересдача и запись" });
  sections.push({ key: "doctor", title: "Для врача", cls: "info", count: "клиническое резюме" });
  sections.push({ key: "all", title: "Справочник по всем показателям", cls: "info", count: markers(indicators.length) });
  sections.forEach((s, i) => (s.num = String(i + 1).padStart(2, "0")));
  const sec = Object.fromEntries(sections.map((s) => [s.key, s]));

  const groups = new Map();
  for (const i of indicators) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>Отчет по анализам — ${esc(clinic.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --p:${c.primary}; --ps:${c.primarySoft}; --a:${c.accent};
          --ink:#1B2526; --muted:#5F6B6D; --line:#E2E8E8; --bg:#F4F6F6;
          --ok:#2E8B57; --okbg:#E6F4EC; --warn:#C7791A; --warnbg:#FDF1DF; --bad:#C8423A; --badbg:#FBE7E4;
          --info:#3A6EA5; --infobg:#E7EFF8; }
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Inter, "Segoe UI", Arial, sans-serif; color: var(--ink);
         font-size: 10pt; line-height: 1.5; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media screen { body { width: 210mm; padding: 14mm; } }
  p { margin: 0; }

  header { display:flex; justify-content:space-between; align-items:center;
           padding-bottom: 12px; border-bottom: 3px solid var(--p); }
  .brand { display:flex; gap:10px; align-items:center; }
  .brand .n { font-size: 17pt; font-weight:700; color: var(--p); letter-spacing:-.3px; }
  .brand .t { font-size: 9pt; color: var(--muted); }
  .contacts { text-align:right; font-size: 8.5pt; color: var(--muted); }

  .titlebar { display:flex; justify-content:space-between; align-items:flex-end; margin: 18px 0 14px; }
  h1 { font-size: 21pt; margin: 0; letter-spacing:-.5px; line-height:1.15; }
  .gen { font-size: 8.5pt; color: var(--muted); margin-top: 4px; }
  .who { text-align:right; font-size: 9pt; color: var(--muted); }
  .who b { color: var(--ink); font-size: 10.5pt; }

  .card { background:#fff; border: 1px solid var(--line); border-radius: 12px; break-inside: avoid; }

  .overview .row { display:grid; grid-template-columns: 120px 110px 1fr; align-items:center;
                   padding: 10px 16px; border-top: 1px solid var(--line); }
  .overview .row:first-child { border-top: 0; }
  .overview .lbl { font-weight:600; }
  .overview .big { font-size: 15pt; font-weight:700; } .overview .big small { font-size: 9pt; font-weight:400; color: var(--muted); }
  .chips { display:flex; gap: 16px; flex-wrap: wrap; color: var(--muted); }
  .chips b { color: var(--ink); }
  .bullet { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right: 7px; vertical-align: 1px; flex: none; }
  .bullet.bad { background: var(--bad); } .bullet.warn { background: var(--warn); }
  .bullet.ok { background: var(--ok); } .bullet.info { background: var(--info); }

  .summary { margin-top: 12px; background: var(--ps); border-radius: 12px; padding: 14px 18px; break-inside: avoid; }
  .summary .st { font-weight:700; color: var(--p); margin-bottom: 4px; }

  .toc { margin-top: 12px; }
  .toc .head { padding: 9px 16px; font-weight:600; font-size: 9pt; border-bottom: 1px solid var(--line); background: #FAFBFB;
               border-radius: 12px 12px 0 0; }
  .toc .item { padding: 8px 16px; border-top: 1px solid var(--line); }
  .toc .item:nth-child(2) { border-top: 0; }
  .toc .line { display:flex; justify-content:space-between; align-items:center; }
  .toc .line .t { font-weight:600; } .toc .cnt { color: var(--muted); font-size: 9pt; }
  .toc ul { margin: 3px 0 0 32px; padding: 0; list-style: none; font-size: 9pt; color: var(--muted); }
  .toc li { display:flex; align-items:baseline; }

  .num { display:inline-block; font-size: 8.5pt; font-weight:700; border-radius: 5px; padding: 1px 6px; margin-right: 9px; }
  .num.bad { color: var(--bad); background: var(--badbg); } .num.warn { color: var(--warn); background: var(--warnbg); }
  .num.ok { color: var(--ok); background: var(--okbg); } .num.info { color: var(--info); background: var(--infobg); }

  .shead { display:flex; align-items:center; margin: 24px 0 2px; padding-bottom: 6px; border-bottom: 1px solid var(--line);
           break-after: avoid; }
  .shead h2 { margin: 0; font-size: 14pt; letter-spacing:-.2px; }
  .snote { color: var(--muted); font-size: 9pt; margin: 6px 0 10px; break-after: avoid; }

  .finding { padding: 14px 18px; margin-bottom: 10px; break-inside: auto; }
  .finding p { orphans: 3; widows: 3; }
  table.mini tr, .todo, .ftitle { break-inside: avoid; } .ftitle { break-after: avoid; }
  .finding.bad { border-left: 4px solid var(--bad); } .finding.warn { border-left: 4px solid var(--warn); }
  .ftitle { font-weight:700; font-size: 10.5pt; margin-bottom: 6px; display:flex; align-items:baseline; }
  .finding p { color: #2E3A3B; }
  .todo { margin-top: 8px; background: var(--bg); border-radius: 8px; padding: 7px 11px; font-size: 9.5pt; }
  .todo b { color: var(--p); }

  table { width:100%; border-collapse: collapse; }
  table.mini { margin-top: 10px; }
  table.mini td { padding: 5px 4px; border-top: 1px solid var(--line); vertical-align: middle; }
  td.mname { width: 42%; font-size: 9pt; } td.val { width: 17%; white-space:nowrap; } td.range { width: 25%; } td.st { text-align:right; }
  .code { font-size: 7.5pt; color: var(--muted); font-weight:500; }
  .unit { font-size: 8.5pt; color: var(--muted); }
  .ref { font-size: 7.5pt; color: var(--muted); margin-top: 3px; }
  .bar { position:relative; height: 6px; background: #EEF1F1; border-radius: 3px; }
  .bar .zone { position:absolute; top:0; height:100%; background: #BFE3CD; border-radius: 3px; }
  .bar .dot { position:absolute; top:50%; width: 11px; height: 11px; border-radius:50%;
              transform: translate(-50%,-50%); border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.15); }
  .dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.bad { background: var(--bad); }
  .pill { font-size: 7.5pt; font-weight:600; padding: 2px 8px; border-radius: 20px; white-space:nowrap; }
  .pill.ok { color: var(--ok); background: var(--okbg); } .pill.warn { color: var(--warn); background: var(--warnbg); }
  .pill.bad { color: var(--bad); background: var(--badbg); }

  .test { padding: 11px 16px; margin-bottom: 8px; }
  .test b { display:block; margin-bottom: 2px; }
  .test div { color: var(--muted); font-size: 9.5pt; }
  .tag { display:inline-block; font-size: 7.5pt; font-weight:600; color: var(--info); background: var(--infobg);
         border-radius: 4px; padding: 0 5px; margin: 4px 4px 0 0; }

  .sub { font-weight:700; font-size: 10.5pt; margin: 14px 0 8px; color: var(--p); break-after: avoid; }
  .retest { display:flex; gap: 14px; align-items:center; padding: 11px 16px; margin-bottom: 8px; }
  .when { flex:none; font-size: 8.5pt; font-weight:700; color: var(--p); background: var(--ps); border-radius: 8px;
          padding: 6px 10px; text-align:center; width: 108px; }
  .retest div div { color: var(--muted); font-size: 9.5pt; }
  .book { display:grid; grid-template-columns: 1fr 120px; gap: 16px; align-items:center;
          border: 1.5px solid var(--p); padding: 14px 18px; }
  .spec { margin-bottom: 8px; } .spec:last-child { margin-bottom:0; }
  .spec b { color: var(--p); } .spec .u { display:inline-block; font-size:8pt; background: var(--ps);
          color: var(--p); border-radius: 20px; padding: 1px 8px; margin-left: 6px; font-weight:600; }
  .spec div { color: var(--muted); font-size: 9.5pt; }
  .qr { text-align:center; font-size: 8pt; color: var(--muted); }
  .qr img { width: 110px; height: 110px; display:block; margin: 0 auto 2px; }
  .recs { display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .rec { background: var(--bg); border-radius: 10px; padding: 12px 14px; break-inside: avoid; }
  .rec b { display:block; margin-bottom: 4px; } .rec div { font-size: 9pt; color: var(--muted); }

  .doctor { border: 1.5px dashed var(--info); background: #FAFCFE; padding: 16px 18px; }
  .doctor .lead { font-size: 9.5pt; }
  .doctor .cols { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
  .doctor h4 { margin: 0 0 4px; font-size: 9pt; text-transform: uppercase; letter-spacing:.4px; color: var(--info); }
  .doctor ul { margin: 0; padding-left: 16px; font-size: 9.5pt; }

  table.all th { text-align:left; font-size: 7.5pt; text-transform: uppercase; letter-spacing:.4px; color: var(--muted);
       font-weight:600; padding: 6px 6px; border-bottom: 1px solid var(--line); }
  table.all td { padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.all tr { break-inside: avoid; }
  table.all tr.group td { background: var(--ps); color: var(--p); font-weight:700; font-size: 9pt; padding: 5px 8px; }
  table.all td.name { width: 50%; }
  table.all td.val, table.all td.range, table.all td.st { padding-top: 10px; }
  .expl { font-size: 8.5pt; color: var(--muted); margin-top: 3px; }
  .expl i { font-style: normal; color: var(--ink); font-weight: 600; }

  .end { break-inside: avoid; }
  .sign { display:flex; justify-content:space-between; margin-top: 18px; font-size: 9pt; color: var(--muted); }
  .disclaimer { margin-top: 12px; font-size: 8pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: 8px; }
  .page { break-before: page; }
</style></head>
<body>
  <header>
    <div class="brand"><div>${logoHtml(c)}<div class="t">${esc(clinic.tagline)}</div></div></div>
    <div class="contacts">${esc(clinic.city)}<br>${[clinic.phone, clinic.instagram].filter(Boolean).map(esc).join(" · ")}<br>${esc(clinic.site)}</div>
  </header>

  <div class="titlebar">
    <div><h1>Отчет по результатам анализов</h1><div class="gen">Сформирован ${today}</div></div>
    <div class="who"><b>Пациент</b><br>${[SEX[patient.sex], patient.age && `${patient.age} лет`].filter(Boolean).join(" · ")}</div>
  </div>

  <div class="card overview">
    <div class="row"><span class="lbl">Анализы</span><span class="big">1 <small>бланк</small></span>
      <span class="chips"><span>от <b>${esc(patient.sample_date || "—")}</b></span><span>лаборатория <b>${esc(patient.lab || "—")}</b></span></span></div>
    <div class="row"><span class="lbl">Показатели</span><span class="big">${indicators.length} <small>измерено</small></span>
      <span class="chips">
        <span><span class="bullet bad"></span><b>${counts.out_of_range}</b> вне нормы</span>
        <span><span class="bullet warn"></span><b>${counts.watch}</b> стоит понаблюдать</span>
        <span><span class="bullet ok"></span><b>${counts.in_range}</b> в норме</span></span></div>
  </div>

  <div class="summary"><div class="st">Главное · ${OVERALL[report.overall_status]}</div><p>${esc(report.summary)}</p></div>

  <div class="card toc">
    <div class="head">Содержание</div>
    ${sections
      .map(
        (s) => `<div class="item"><div class="line"><span><span class="num ${s.cls}">${s.num}</span><span class="t">${s.title}</span></span>
        <span class="cnt">${s.count}</span></div>
        ${s.items ? `<ul>${s.items.map((f) => `<li><span class="bullet ${s.cls}"></span>${esc(f.title)}</li>`).join("")}</ul>` : ""}</div>`,
      )
      .join("")}
  </div>

  ${sections
    .filter((s) => s.items)
    .map(
      (s) => `${sectionHead(s.num, s.title, s.cls, `${s.count} · ${s.note}`)}
    ${s.items.map((f) => findingCard(f, byCode)).join("")}`,
    )
    .join("")}

  ${sectionHead(sec.add.num, sec.add.title, "info", "Этих анализов нет в бланке — каждый уточнит один из результатов выше. Обсудите с врачом на приеме.")}
  ${tests_to_add
    .map(
      (t) => `<div class="card test"><b>${esc(t.name)}</b><div>${esc(t.reason)}</div>
      ${t.related_codes.map((code) => `<span class="tag">${esc(code)}</span>`).join("")}</div>`,
    )
    .join("")}

  ${sectionHead(sec.plan.num, sec.plan.title, "info", "")}
  ${retest.length ? `<div class="sub">Пересдать</div>` : ""}
  ${retest
    .map((r) => `<div class="card retest"><span class="when">${esc(r.when)}</span><div><b>${esc(r.name)}</b><div>${esc(r.reason)}</div></div></div>`)
    .join("")}
  <div class="sub">К какому врачу обратиться</div>
  <div class="card book">
    <div>${specialists
      .map(
        (s) => `<div class="spec"><b>${esc(s.name)}</b><span class="u">${URGENCY[s.urgency]}</span>
      <div>${esc(s.reason)}</div></div>`,
      )
      .join("")}</div>
    <div class="qr"><img src="${qrDataUrl}" alt="QR для записи">Записаться<br>в WhatsApp</div>
  </div>
  ${lifestyle.length ? `<div class="sub">Что можно сделать самому</div>` : ""}
  <div class="recs">${lifestyle.map((r) => `<div class="rec"><b>${esc(r.title)}</b><div>${esc(r.details)}</div></div>`).join("")}</div>

  <div class="page">${sectionHead(sec.doctor.num, sec.doctor.title, "info", "Краткое резюме для лечащего врача клиники.")}</div>
  <div class="card doctor">
    <p class="lead">${esc(doctor_summary.conclusion)}</p>
    <div class="cols">
      <div><h4>Обратить внимание</h4><ul>${doctor_summary.considerations.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><h4>Предлагаемое дообследование</h4><ul>${doctor_summary.suggested_workup.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div>
  </div>

  ${sectionHead(sec.all.num, sec.all.title, "info", "Что означает каждый показатель и ваш результат.")}
  <table class="all">
    <thead style="display:table-header-group"><tr><th>Показатель</th><th>Результат</th><th>Шкала</th><th></th></tr></thead>
    <tbody>${[...groups]
      .map(
        ([group, items]) => `<tr class="group"><td colspan="4">${esc(group)}</td></tr>
      ${items
        .map(
          (i) => `<tr>
        <td class="name"><b>${esc(i.name)}</b> <span class="code">${esc(i.code)}</span>
          <div class="expl">${esc(i.what_it_is)}</div>
          <div class="expl"><i>Ваш результат:</i> ${esc(i.your_result)}</div></td>
        <td class="val"><b>${fmt(i)}</b> <span class="unit">${esc(i.unit)}</span></td>
        <td class="range">${rangeBar(i)}<div class="ref">норма ${esc(commas(i.ref_text))}</div></td>
        <td class="st">${pill(i)}</td></tr>`,
        )
        .join("")}`,
      )
      .join("")}</tbody>
  </table>

  <div class="end"><div class="sign"><span>Заключение подготовлено с помощью ИИ и проверено врачом</span><span>${esc(clinic.doctor)}</span></div>
  <div class="disclaimer">Отчет носит информационный характер и не является диагнозом. Интерпретацию результатов
  и назначение лечения проводит лечащий врач. ФИО и идентификаторы пациента в отчет не включаются.</div></div>
</body></html>`;
}

// JSON Schema ответа LLM. Используется в structured outputs, поэтому
// у каждого объекта additionalProperties: false и полный список required.

const str = { type: "string" };
const num = { type: "number" };
const nullableNum = { type: ["number", "null"] };
const obj = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const arr = (items) => ({ type: "array", items });
const oneOf = (...values) => ({ type: "string", enum: values });
const text = (description) => ({ type: "string", description });

export const reportSchema = obj({
  patient: obj({
    sex: oneOf("male", "female", "unknown"),
    age: nullableNum,
    sample_date: text("Дата взятия образца, ДД.ММ.ГГГГ или пустая строка"),
    lab: text("Название лаборатории с бланка"),
  }),
  overall_status: oneOf("normal", "attention", "urgent"),
  summary: text("Главное в 4–6 предложениях простым языком: общая картина, что изменено, насколько это важно, что делать"),
  indicators: arr(
    obj({
      name: text("Название показателя по-русски, без аббревиатур в скобках"),
      code: text("Короткое обозначение: HGB, WBC, NEUT% и т.п."),
      group: oneOf("Эритроциты и гемоглобин", "Лейкоциты и формула", "Тромбоциты", "Биохимия", "Гормоны", "Витамины и минералы", "Прочее"),
      value: num,
      unit: str,
      ref_low: nullableNum,
      ref_high: nullableNum,
      ref_text: text("Референс как на бланке, например «48.0 - 78.0» или «< 15»"),
      status: {
        type: "string",
        enum: ["low", "high", "borderline", "normal"],
        description: "low/high — вне референса; borderline — внутри, но в крайних ~10% диапазона и это клинически осмысленно; иначе normal",
      },
      what_it_is: text("1–2 предложения: что измеряет показатель и зачем он нужен организму"),
      your_result: text("1–2 предложения: что значит именно это значение у этого пациента, с учетом связанных показателей"),
    }),
  ),
  findings: arr(
    obj({
      category: oneOf("out_of_range", "watch", "in_range"),
      title: text("Заголовок-вывод по группе связанных показателей, например «Признаков воспаления нет»"),
      codes: arr(str),
      explanation: text(
        "Развернутый абзац 4–7 предложений для пациента: почему эти показатели рассматриваются вместе, " +
          "что показывает их сочетание, какие частые безопасные и менее частые причины бывают, насколько это важно",
      ),
      what_to_do: text("1–2 предложения: конкретный следующий шаг; пустая строка для in_range"),
    }),
  ),
  tests_to_add: arr(
    obj({
      name: str,
      reason: text("Почему этот анализ уточнит картину — со ссылкой на конкретные результаты"),
      related_codes: arr(str),
    }),
  ),
  retest: arr(obj({ name: str, when: str, reason: str })),
  specialists: arr(obj({ name: text("Специальность врача"), reason: str, urgency: oneOf("routine", "soon", "urgent") })),
  lifestyle: arr(obj({ title: str, details: str })),
  doctor_summary: obj({
    conclusion: text("Клиническое резюме для врача медицинской терминологией, 3–5 предложений, с цифрами"),
    considerations: arr(str),
    suggested_workup: arr(str),
  }),
});

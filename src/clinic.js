// Брендинг отчета. Сейчас отчет оформлен под labtell; для персонального демо под конкретную
// клинику достаточно поменять название, логотип, цвета, контакты и ссылку записи.

export const clinic = {
  name: "labtell",
  tagline: "Отчеты по результатам анализов",
  city: "Алматы · Астана",
  phone: "+7 (700) 000-00-00",
  site: "labtell.ai",
  instagram: "",
  colors: {
    primary: "#0F5C5C",
    primarySoft: "#E3F0EE",
    accent: "#E8A33D",
  },
  // Куда ведет QR «Записаться к врачу»: WhatsApp клиники с готовым текстом
  bookingUrl:
    "https://wa.me/77000000000?text=" +
    encodeURIComponent("Здравствуйте! Хочу записаться на консультацию по результатам анализов."),
  doctor: "Врач-терапевт ________________",
};

// Логотип в шапке отчета (HTML). Для клиники сюда ставится ее логотип.
export const logoHtml = (colors) =>
  `<span style="font-weight:800;font-size:22pt;letter-spacing:-0.8px;color:#1B2526">lab<span style="color:${colors.primary}">tell</span></span>`;

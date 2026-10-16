// Брендинг выдуманной клиники. Для персонального демо под конкретную клинику
// достаточно поменять название, цвета, контакты и ссылку записи.

export const clinic = {
  name: "Qalqan Health",
  tagline: "Клиника превентивной медицины",
  city: "Алматы · Астана",
  phone: "+7 (700) 000-00-00",
  site: "qalqan.health",
  instagram: "@qalqan.health",
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

// Логотип: щит с пульсом (qalqan — «щит» по-казахски)
export const logoSvg = (color) => `
<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
  <path d="M24 3 L42 9 V22 C42 33 34.5 41.5 24 45 C13.5 41.5 6 33 6 22 V9 Z" fill="${color}"/>
  <path d="M12 25 H18 L21 18 L25.5 31 L29 22 L31 25 H36" fill="none" stroke="#fff"
        stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

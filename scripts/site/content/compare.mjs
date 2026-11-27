// Comparison pages: one per column of the comparison table on the home page. The table rows are read from that page
// (website/index.html and website/en/index.html), so a fact is corrected there, once. Here: only the words around it.
// `column` must match the table's column heading in each language.
const US = {
  he: "אתם רוצים את כל התמונה, כולל פנסיה, ביטוחים, מס ותחזית, בלי מנוי ובלי שהנתונים יישבו אצל חברה. יש לכם מחשב בבית, ואתם מוכנים להתקנה של כמה דקות.",
  en: "You want the whole picture, including pension, insurance, tax and a forecast, with no subscription and without your data sitting with a company. You have a computer at home and don't mind a few minutes of setup.",
};

const list = [
  {
    slug: "riseup",
    column: { he: "RiseUp", en: "RiseUp" },
    what: {
      he: "RiseUp היא שירות במנוי חודשי לניהול תזרים, שמתחבר לבנק בבנקאות פתוחה מורשית ושומר את הנתונים אצלו.",
      en: "RiseUp is a monthly subscription service for managing cash flow. It connects to your bank through licensed open banking and keeps the data on its side.",
    },
    them: {
      he: "אתם רוצים חיבור לבנק בלי למסור סיסמה, אפליקציה בטלפון שעובדת גם כשהמחשב כבוי, וליווי של מומחי תזרים בוואטסאפ.",
      en: "You want your bank connected without handing over a password, a phone app that works when your computer is off, and cash-flow experts to guide you on WhatsApp.",
    },
  },
  {
    slug: "shavve",
    column: { he: "Shavve", en: "Shavve" },
    what: {
      he: "Shavve היא אפליקציה בענן עם מסלול Pro בתשלום, שמתחברת לבנק בבנקאות פתוחה מורשית ומציעה משק בית משותף.",
      en: "Shavve is a cloud app with a paid Pro tier. It connects to your bank through licensed open banking and offers a shared household.",
    },
    them: {
      he: "אתם רוצים חיבור לבנק בלי למסור סיסמה, ואפליקציה ל-iOS ולאנדרואיד שעובדת גם כשהמחשב כבוי.",
      en: "You want your bank connected without handing over a password, and an iOS and Android app that works when your computer is off.",
    },
  },
  {
    slug: "moneytor",
    column: { he: "Moneytor", en: "Moneytor" },
    what: {
      he: "Moneytor היא שירות בענן עם מסלול בסיסי ידני בחינם ומסלול פרימיום בתשלום, שבו נמצאים החיבור לבנקים, ה-API וה-MCP.",
      en: "Moneytor is a cloud service with a free manual tier and a paid premium tier, which is where bank connections, the API and MCP live.",
    },
    them: {
      he: "אתם רוצים חיבור לבנק בבנקאות פתוחה מורשית, בלי למסור סיסמה, ושירות שעובד ב-iOS ובדפדפן גם כשהמחשב כבוי.",
      en: "You want your bank connected through licensed open banking, without handing over a password, and a service that works on iOS and in the browser when your computer is off.",
    },
  },
  {
    slug: "familybiz",
    column: { he: "FamilyBiz", en: "FamilyBiz" },
    what: {
      he: "FamilyBiz היא אפליקציה בענן עם מסלול בסיסי בחינם ומסלול פרימיום, שמתחברת לבנק בבנקאות פתוחה מורשית ומטפלת בביטוח ובפנסיה דרך סוכנות מורשית.",
      en: "FamilyBiz is a cloud app with a free basic tier and a premium tier. It connects to your bank through licensed open banking and handles insurance and pension through a licensed agency.",
    },
    them: {
      he: "אתם רוצים חיבור לבנק בלי למסור סיסמה, אפליקציה ל-iOS ולאנדרואיד, ומישהו מורשה שיטפל בשבילכם בביטוח ובפנסיה.",
      en: "You want your bank connected without handing over a password, an iOS and Android app, and someone licensed to handle insurance and pension for you.",
    },
  },
  {
    slug: "cover",
    column: { he: "Cover", en: "Cover" },
    what: {
      he: "Cover היא שירות חינמי שמציג פנסיה וביטוחים דרך המסלקה הפנסיונית ומשרד האוצר, עם המלצות וסוכן AI שזמין גם בוואטסאפ.",
      en: "Cover is a free service that shows your pension and insurance through the pension clearing house and the Ministry of Finance, with recommendations and an AI agent that is also on WhatsApp.",
    },
    us: {
      he: "אתם רוצים גם את הבנקים, כרטיסי האשראי, התקציב והתחזית באותו מקום עם הפנסיה והביטוחים, ושהנתונים יישארו על המחשב שלכם.",
      en: "You want your banks, credit cards, budget and forecast in the same place as pension and insurance, and you want the data to stay on your computer.",
    },
    them: {
      he: "אתם רוצים רק לראות פנסיה וביטוחים בחינם, עם המלצות, בלי להתקין שום דבר.",
      en: "You just want to see your pension and insurance for free, with recommendations, without installing anything.",
    },
  },
  {
    slug: "myfinanda",
    column: { he: "MyFinanda", en: "MyFinanda" },
    what: {
      he: "MyFinanda היא אפליקציה ל-iOS בתשלום לפי תקופה, שמתחברת לבנק בבנקאות פתוחה מורשית, בקריאה בלבד.",
      en: "MyFinanda is an iOS app paid per period. It connects to your bank through licensed open banking, read-only.",
    },
    them: {
      he: "אתם רוצים חיבור לבנק בלי למסור סיסמה, ואפליקציה ב-iPhone שעובדת גם כשהמחשב כבוי.",
      en: "You want your bank connected without handing over a password, and an iPhone app that works when your computer is off.",
    },
  },
  {
    slug: "bank-app",
    column: { he: "אפליקציית הבנק", en: "Bank app" },
    what: {
      he: "אפליקציית הבנק כלולה בחשבון ומציגה את מה שיש באותו בנק. בדקנו את הפועלים, לאומי ופפר.",
      en: "Your bank's app comes with the account and shows what is in that bank. We looked at Hapoalim, Leumi and Pepper.",
    },
    us: {
      he: "יש לכם יותר מבנק אחד, או כרטיסים מכמה חברות, ואתם רוצים לראות הכול יחד, עם תקציב, פנסיה ותחזית.",
      en: "You have more than one bank, or cards from several companies, and you want to see everything together, with a budget, pension and a forecast.",
    },
    them: {
      he: "כל הכסף שלכם בבנק אחד, ואתם רוצים משהו שכבר כלול בחשבון ועובד בטלפון בלי התקנה.",
      en: "All your money is in one bank, and you want something that already comes with the account and works on your phone with nothing to install.",
    },
  },
  {
    slug: "excel",
    column: { he: "Excel", en: "Excel" },
    what: {
      he: "גיליון Excel הוא הדרך הוותיקה ביותר לנהל כסף: קובץ שלכם, שבו מקלידים או מעתיקים הכול ביד.",
      en: "An Excel sheet is the oldest way to manage money: a file of your own, where everything is typed or copied in by hand.",
    },
    us: {
      he: "נמאס לכם להקליד. אתם רוצים שהתנועות ייכנסו ויסווגו לבד, ושהתקציב, התחזית והמקומות שבהם אפשר לחסוך יחושבו בשבילכם. את הקובץ הקיים אפשר לייבא.",
      en: "You're tired of typing. You want transactions to arrive and be categorised on their own, and the budget, the forecast and the places you could save to be worked out for you. Your existing file can be imported.",
    },
    them: {
      he: "אתם אוהבים לבנות הכול בעצמכם, מוכנים להקליד או להעתיק תנועות ביד, ורוצים קובץ שנפתח גם בטלפון.",
      en: "You like building it all yourself, don't mind typing or copying transactions by hand, and want a file that opens on your phone too.",
    },
  },
];

const TAIL = {
  he: "Penny היא תוכנה חינמית בקוד פתוח שרצה על המחשב שלכם. כך הן נראות זו מול זו, לפי מה שמתפרסם באתר או בחנות האפליקציות של כל מוצר.",
  en: "Penny is free, open-source software that runs on your own computer. This is how they look side by side, going by what each product says on its own site or app-store page.",
};
const text = (p, lang) => {
  const name = p.column[lang];
  const he = lang === "he";
  return {
    h1: he ? `Penny מול ${name}.` : `Penny vs ${name}.`,
    desc: he
      ? `Penny מול ${name}: מחיר, איך מתחברים לבנק, איפה הנתונים, תקציב, פנסיה וביטוחים, AI ואפליקציה לטלפון.`
      : `Penny vs ${name}: price, how each connects to your bank, where your data lives, budgeting, pension and insurance, AI and a phone app.`,
    intro: `${p.what[lang]} ${TAIL[lang]}`,
    usTitle: he ? "מתי לבחור ב-Penny" : "When to choose Penny",
    us: (p.us ?? US)[lang],
    themTitle: he ? `מתי לבחור ב-${name}` : `When to choose ${name}`,
    them: p.them[lang],
  };
};

const compare = {
  pages: list.map((p) => ({
    slug: p.slug,
    column: p.column,
    he: text(p, "he"),
    en: text(p, "en"),
  })),
  index: {
    he: {
      title: "השוואות",
      desc: "Penny מול RiseUp, ‏Shavve, ‏Moneytor, ‏FamilyBiz, ‏Cover, ‏MyFinanda, אפליקציית הבנק ו-Excel: מחיר, חיבור לבנק, פרטיות ויכולות.",
      h1: "Penny מול מה שיש בישראל.",
      lead: "בדקנו מה כל מוצר אומר על עצמו באתר שלו או בחנות האפליקציות. איפה שאחרים טובים מאיתנו, כתבנו את זה.",
    },
    en: {
      title: "Compare",
      desc: "Penny against RiseUp, Shavve, Moneytor, FamilyBiz, Cover, MyFinanda, your bank's app and Excel: price, bank connection, privacy and capabilities.",
      h1: "Penny against what's available in Israel.",
      lead: "We checked what each product says about itself on its own site or app-store page. Where others do better than us, we wrote that down.",
    },
  },
};

export default compare;

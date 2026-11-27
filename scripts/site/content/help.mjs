// The help page: one place that points at everything a stuck or curious visitor needs. Each link is [href, title, text].
const GH = "https://github.com/Sergey-Bar/Penny";
const DOCS = `${GH}/blob/main/docs`;
const DEMO = "https://penny-finance-demo.vercel.app";

const help = {
  he: {
    title: "עזרה ומשאבים",
    desc: "כל מה שצריך כדי להתחיל עם Penny או לפתור תקלה: התקנה, מדריכים, מסמכים מפורטים, מה חדש, מה בדרך ואיך לדווח על בעיה.",
    h1: "עזרה ומשאבים.",
    lead: "Penny היא פרויקט קוד פתוח בלי מוקד תמיכה. במקום זה, הכול כתוב ופתוח: מדריכים, מסמכים, ומקום לשאול ולדווח.",
    groups: [
      {
        h: "מתחילים",
        p: "שלוש דרכים להיכנס, לפי כמה זמן יש לכם.",
        links: [
          [
            "install.html",
            "הורדה והתקנה",
            "הצעדים לכל מערכת, מה צריך לפני שמתחילים, ומה מגדירים אחרי.",
          ],
          [
            "guides.html",
            "מדריכים",
            "צעד אחר צעד: חיבור בנק ראשון, מעבר מ-Excel, תקציב, פנסיה, גיבוי וטלגרם.",
          ],
          [DEMO, "לנסות בדפדפן", "האפליקציה המלאה עם משק בית לדוגמה, בלי הרשמה ובלי התקנה."],
        ],
      },
      {
        h: "משהו לא עובד",
        p: "רוב התקלות הן בהתקנה או בסנכרון עם בנק, ולרובן יש פתרון כתוב.",
        links: [
          [
            "install.html#trouble",
            "תקלות נפוצות",
            "אזהרות של Windows ו-Mac, סנכרון שנכשל, Docker, פורט תפוס ועוד.",
          ],
          [
            `${DOCS}/install.md#troubleshooting`,
            "פתרון תקלות מלא",
            "הרשימה המלאה במדריך ההתקנה בגיטהאב (באנגלית).",
          ],
          [
            `${GH}/issues`,
            "דיווח על תקלה",
            "פותחים פנייה בגיטהאב. בלי פרטי חשבון, סיסמאות או צילומי מסך עם נתונים אמיתיים.",
          ],
        ],
      },
      {
        h: "מסמכים מפורטים",
        p: "המסמכים המלאים נמצאים בגיטהאב, באנגלית.",
        links: [
          [
            `${DOCS}/features.md`,
            "כל היכולות בפירוט",
            "מה יש באפליקציה, למי היא מתאימה, ואילו מוסדות נתמכים.",
          ],
          [
            `${DOCS}/importing.md`,
            "ייבוא קבצים",
            "קובצי תנועות, תיקיית הייבוא, הגיליון החכם ודוח הפנסיה.",
          ],
          [
            `${DOCS}/mcp.md`,
            "חיבור סוכן AI ב-MCP",
            "איך נותנים לסוכן AI לקרוא את המספרים של הבית, בקריאה בלבד.",
          ],
          [`${DOCS}/security.md`, "סקירת האבטחה", "מה מוגן, איך, ומה נשאר באחריותכם."],
          [
            `${DOCS}/pension-report.md`,
            "מבנה דוח הפנסיה",
            "קובץ ה-JSON שמייבאים מדוח הסוכן, שדה אחרי שדה.",
          ],
          [
            `${DOCS}/install.md`,
            "מדריך ההתקנה המלא",
            "כל אפשרות התקנה, פקודות השירות ואיפה הנתונים נשמרים.",
          ],
        ],
      },
      {
        h: "מה חדש ומה בדרך",
        p: "הפרויקט מתפתח בגלוי. אפשר לראות מה נכנס בכל גרסה ומה מתוכנן.",
        links: [
          [`${GH}/releases`, "גרסאות ומה השתנה", "קובצי ההתקנה ורשימת השינויים של כל גרסה."],
          [`${DOCS}/features.md#roadmap`, "תוכנית העבודה", "מה כבר נעשה ומה עדיין פתוח."],
          ["features.html", "כל הפיצ'רים", 'מה עובד היום, ומה מסומן "בקרוב".'],
        ],
      },
      {
        h: "אבטחה ותרומה לפרויקט",
        p: "מצאתם בעיית אבטחה, או רוצים לעזור? כך עושים את זה נכון.",
        links: [
          [
            `${GH}/blob/main/SECURITY.md`,
            "דיווח על בעיית אבטחה",
            "מדיניות האבטחה, ואיך מדווחים באופן אחראי.",
          ],
          [
            `${GH}/blob/main/CONTRIBUTING.md`,
            "איך תורמים",
            "הקמת סביבת פיתוח, כללי הקוד ואיך פותחים בקשת מיזוג.",
          ],
          ["./#contributors", "התורמים לפרויקט", "האנשים ש-Penny קיימת בזכותם."],
        ],
      },
    ],
  },
  en: {
    title: "Help and resources",
    desc: "Everything you need to get started with Penny or fix a problem: installing, guides, detailed docs, what's new, what's planned and how to report an issue.",
    h1: "Help and resources.",
    lead: "Penny is an open-source project with no support desk. Instead, everything is written down and open: guides, docs, and a place to ask and report.",
    groups: [
      {
        h: "Getting started",
        p: "Three ways in, depending on how much time you have.",
        links: [
          [
            "install.html",
            "Download and install",
            "The steps for each system, what you need first, and what to set up after.",
          ],
          [
            "guides.html",
            "Guides",
            "Step by step: your first bank, moving from Excel, a budget, pension, backup and Telegram.",
          ],
          [
            DEMO,
            "Try it in your browser",
            "The full app with a sample household, no signup and no install.",
          ],
        ],
      },
      {
        h: "Something isn't working",
        p: "Most problems are with installing or with a bank sync, and most have a written fix.",
        links: [
          [
            "install.html#trouble",
            "Common problems",
            "Windows and Mac warnings, a failed sync, Docker, a busy port and more.",
          ],
          [
            `${DOCS}/install.md#troubleshooting`,
            "Full troubleshooting",
            "The complete list in the install guide on GitHub.",
          ],
          [
            `${GH}/issues`,
            "Report a problem",
            "Open an issue on GitHub. No account details, passwords or screenshots with real data.",
          ],
        ],
      },
      {
        h: "Detailed docs",
        p: "The full documents are on GitHub.",
        links: [
          [
            `${DOCS}/features.md`,
            "Every capability in detail",
            "What's in the app, who it suits, and which institutions are supported.",
          ],
          [
            `${DOCS}/importing.md`,
            "Importing files",
            "Statement files, the import folder, the smart sheet and the pension report.",
          ],
          [
            `${DOCS}/mcp.md`,
            "Connect an AI agent (MCP)",
            "How to let an AI agent read the household's numbers, read-only.",
          ],
          [
            `${DOCS}/security.md`,
            "Security review",
            "What is protected, how, and what stays your responsibility.",
          ],
          [
            `${DOCS}/pension-report.md`,
            "Pension report format",
            "The JSON file you import from your agent's report, field by field.",
          ],
          [
            `${DOCS}/install.md`,
            "Full install guide",
            "Every install option, the service commands and where your data lives.",
          ],
        ],
      },
      {
        h: "What's new and what's next",
        p: "The project is developed in the open. You can see what landed in each version and what is planned.",
        links: [
          [
            `${GH}/releases`,
            "Releases and changes",
            "The installers and the list of changes for each version.",
          ],
          [`${DOCS}/features.md#roadmap`, "Roadmap", "What is done and what is still open."],
          ["features.html", "All features", 'What works today, and what is marked "Soon".'],
        ],
      },
      {
        h: "Security and contributing",
        p: "Found a security problem, or want to help? Here is how to do it right.",
        links: [
          [
            `${GH}/blob/main/SECURITY.md`,
            "Report a security issue",
            "The security policy, and how to disclose responsibly.",
          ],
          [
            `${GH}/blob/main/CONTRIBUTING.md`,
            "How to contribute",
            "Setting up a dev environment, the code rules and how to open a pull request.",
          ],
          ["./#contributors", "Project contributors", "The people Penny exists thanks to."],
        ],
      },
    ],
  },
};

export default help;

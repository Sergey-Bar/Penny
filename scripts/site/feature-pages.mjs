// Content for the per-feature pages on the website. One entry per page, Hebrew and English side by side.
// `id` is the card id on features.html (f-<id>); `slug` names the file: website/feature-<slug>.html.
// A section's `shot` is "<folder>/<name>": website/<folder>/<lang>/<name>.webp. `embed` reuses a block from the site.
// After editing, run: npm run site:features
const GH = "https://github.com/Sergey-Bar/Penny";

const pages = [
  {
    id: "banks",
    slug: "bank-sync",
    demo: "/accounts",
    related: ["import", "transactions", "privacy"],
    he: {
      h1: "כל הבנקים וכרטיסי האשראי, מסתנכרנים לבד.",
      desc: "סנכרון אוטומטי של 18 בנקים וחברות אשראי בישראל, כל יום, עם סיסמאות שמוצפנות על המחשב שלכם. גם בנקאות פתוחה, קוד חד-פעמי והגנה מכפילויות.",
      intro:
        "Penny נכנסת לאתר הבנק ולאתר חברת האשראי במקומכם, מושכת את התנועות והיתרות ומעדכנת אותן כל יום. הסיסמאות נשמרות מוצפנות על המחשב שלכם, ולא עוברות דרך שום שרת.",
      sections: [
        {
          h: "18 בנקים וחברות אשראי בישראל",
          p: "כל החשבונות והכרטיסים ברשימה אחת, עם היתרה של כל אחד והשווי הנקי של הבית למעלה.",
          embed: "banks",
          shot: "demo/accounts",
          alt: "כל החשבונות: חיבורי הבנקים, היתרות והשווי הנקי",
        },
        {
          h: "סנכרון יומי, או מתי שמבקשים",
          p: "הסנכרון רץ כל יום לפי לוח זמנים, כך שהמספרים טריים כשפותחים את האפליקציה.",
          list: [
            "שירות ברקע שעולה עם המחשב",
            "סנכרון מיידי בלחיצה, מהאפליקציה או מבוט הטלגרם",
            "התראה בטלגרם כשחיבור מתחיל להיכשל, וכשהוא חוזר",
          ],
        },
        {
          h: "קוד חד-פעמי מהבנק",
          p: "כשהבנק שולח קוד חד-פעמי באמצע סנכרון, מקלידים אותו באפליקציה או בטלגרם, והסנכרון ממשיך.",
        },
        {
          h: "בנקאות פתוחה במקום סיסמה",
          p: "אפשר לקרוא את החשבונות דרך ממשק הבנקאות הפתוחה (XS2A) של הבנק או של צובר מידע, עם אסימון גישה במקום סיסמת הבנק. החיבור יושב באותה רשימה עם כל השאר.",
        },
        {
          h: "שום דבר לא נספר פעמיים",
          p: "תנועה שמגיעה גם מסנכרון וגם מקובץ נשמרת פעם אחת. הכללים שלכם קובעים קטגוריה, תגיות ובעלים בכל סנכרון, כך שהתנועות נכנסות כבר מסודרות.",
        },
      ],
      know: [
        "הסנכרון האוטומטי בבטא: בנק יכול לשנות את האתר שלו ולשבור חיבור עד שמתקנים. ייבוא מקובץ עובד תמיד.",
        "לסנכרון אוטומטי צריך לכבות אימות דו-שלבי בכניסה לאתר הבנק (חוץ מוואן זירו).",
        "משיכת נתונים אוטומטית מאתר הבנק עלולה להפר את תנאי השימוש שלו. Penny נועדה לחשבונות שלכם בלבד.",
        "הסנכרון משתמש ב-Chrome או ב-Edge שכבר מותקן אצלכם, ורץ רק כשהמחשב דולק.",
      ],
      faq: [
        [
          "אילו בנקים וכרטיסים נתמכים?",
          "הפועלים, לאומי, דיסקונט, מזרחי טפחות, הבינלאומי, מרכנתיל, אוצר החייל, איגוד, מסד, יהב, פאגי, וואן זירו, ביחד בשבילך ובהצדעה, וכרטיסי ישראכרט, מקס, כאל ואמריקן אקספרס.",
        ],
        [
          "הבנק שלי לא ברשימה. מה עושים?",
          `מייבאים את קובצי התנועות שלו: CSV, ‏Excel או הדבקה של טבלה. <a href="feature-import-files.html">כך עובד הייבוא</a>.`,
        ],
        [
          "זה בטוח לתת לאפליקציה את הסיסמה לבנק?",
          "הסיסמה נשמרת רק על המחשב שלכם, מוצפנת ב-AES-256-GCM, ונשלחת רק לאתר של הבנק עצמו בזמן הסנכרון. אין שרת של Penny שהיא עוברת דרכו, והקוד פתוח לבדיקה.",
        ],
        [
          "כל כמה זמן החשבונות מתעדכנים?",
          "פעם ביום לפי לוח זמנים, ובכל רגע שמבקשים סנכרון ידני. המחשב צריך להיות דולק.",
        ],
      ],
    },
    en: {
      h1: "Every bank and credit card, synced on its own.",
      desc: "Automatic sync for 18 Israeli banks and card companies, every day, with passwords encrypted on your own computer. Plus open banking, one-time codes and duplicate protection.",
      intro:
        "Penny signs in to your bank's and card company's websites for you, pulls transactions and balances, and refreshes them every day. Passwords are stored encrypted on your computer and never pass through a server.",
      sections: [
        {
          h: "18 Israeli banks and card companies",
          p: "Every account and card in one list, each with its balance, and the household's net worth on top.",
          embed: "banks",
          shot: "demo/accounts",
          alt: "All accounts: bank connections, balances and net worth",
        },
        {
          h: "Daily sync, or whenever you ask",
          p: "Sync runs every day on a schedule, so the numbers are fresh when you open the app.",
          list: [
            "A background service that starts with your computer",
            "Sync now with one click, from the app or the Telegram bot",
            "A Telegram alert when a connection starts failing, and when it recovers",
          ],
        },
        {
          h: "One-time codes from the bank",
          p: "When the bank sends a one-time code in the middle of a sync, you type it in the app or in Telegram and the sync carries on.",
        },
        {
          h: "Open banking instead of a password",
          p: "Accounts can also be read through the bank's or an aggregator's open banking (XS2A) interface, with an access token in place of the bank password. The connection sits in the same list as the rest.",
        },
        {
          h: "Nothing is counted twice",
          p: "A transaction that arrives from both sync and a file is stored once. Your rules set category, tags and owner on every sync, so transactions land already sorted.",
        },
      ],
      know: [
        "Automatic sync is in beta: a bank can change its site and break a connection until it is fixed. Importing a file always works.",
        "Automatic sync needs two-factor sign-in turned off on the bank's website (One Zero is the exception).",
        "Pulling data automatically from a bank's site may violate its terms of service. Penny is for your own accounts only.",
        "Sync uses the Chrome or Edge you already have, and runs only while the computer is on.",
      ],
      faq: [
        [
          "Which banks and cards are supported?",
          "Hapoalim, Leumi, Discount, Mizrahi Tefahot, First International, Mercantile, Otsar Hahayal, Union, Massad, Yahav, Pagi, One Zero, Beyahad Bishvilha and Behatsdaa, plus Isracard, Max, Cal and American Express cards.",
        ],
        [
          "My bank isn't listed. What now?",
          `Import its statement files: CSV, Excel, or a pasted table. <a href="feature-import-files.html">How importing works</a>.`,
        ],
        [
          "Is it safe to give the app my bank password?",
          "The password is stored only on your computer, encrypted with AES-256-GCM, and is sent only to the bank's own site during a sync. There is no Penny server for it to pass through, and the code is open to inspect.",
        ],
        [
          "How often are accounts updated?",
          "Once a day on a schedule, and any time you ask for a manual sync. The computer has to be on.",
        ],
      ],
    },
  },
  {
    id: "import",
    slug: "import-files",
    demo: "/transactions",
    related: ["banks", "transactions", "ai"],
    he: {
      h1: "כל קובץ שהבנק מייצא, נכנס.",
      desc: "ייבוא דפי חשבון ב-CSV וב-Excel, תיקייה שמייבאת לבד, גיליון חכם להדבקת טבלאות, ו-PDF או צילום שה-AI שלכם קורא. בלי כפילויות.",
      intro:
        "לחשבונות שאין להם סנכרון אוטומטי, לחודשים שהבנק כבר לא מציג, או למי שלא רוצה למסור סיסמה. ייבוא מקובץ עובד תמיד, גם כשבנק משנה את האתר שלו.",
      sections: [
        {
          h: "דפי חשבון ב-CSV, ‏XLSX ו-XLS",
          p: "מורידים את הקובץ מאתר הבנק או מחברת האשראי, בוחרים את החשבון, ומעלים. אין צורך בסיסמאות ואין גישה לחשבון.",
          shot: "demo/transactions",
          alt: "התנועות אחרי ייבוא, מקובצות לפי שבוע",
        },
        {
          h: "תיקייה שמייבאת לבד",
          p: "Penny עוקבת אחרי תיקייה במחשב, עם תת-תיקייה לכל חשבון. קובץ שנזרק לשם מיובא ועובר לתיקיית המיובאים, ואם משהו נכשל הוא עובר הצידה עם הסבר למה.",
        },
        {
          h: "גיליון חכם",
          p: "מדביקים טבלה כמו שהיא, מ-Excel, מ-Google Sheets או מרשימה שהקלדתם.",
          list: [
            "שורת הכותרת מזוהה לבד: תאריך, תיאור, סכום, חשבון, קטגוריה, תגיות ועוד",
            "כל תא ניתן לעריכה במקום, לפני השמירה",
            "אפשר לבטל את כל הייבוא בלחיצה אחת",
          ],
        },
        {
          h: "PDF, צילום או טקסט",
          p: "דף חשבון ב-PDF, צילום שלו, קבלה או הודעה: ספק ה-AI שבחרתם קורא אותם ומוציא מהם את התנועות.",
        },
        {
          h: "שום דבר לא נספר פעמיים",
          p: "תנועה שכבר קיימת באותו חשבון, באותו סכום ובהפרש של יום לכל היותר, מזוהה ולא נשמרת שוב. כשתנועה מגיעה גם מסנכרון וגם מקובץ, העותק מהסנכרון נשאר, עם הקטגוריה, ההערות והתגיות שלכם.",
        },
      ],
      know: [
        "קטגוריות מוצעות לפי בתי עסק שכבר לימדתם, ולפי מילון מובנה של בתי עסק ישראליים.",
        "ב-Docker תיקיית הייבוא היא imports, ליד קובץ ה-docker-compose.",
        `דוח פנסיה מהסוכן מיובא בנפרד, כקובץ JSON. <a href="feature-pension-savings.html">עוד על פנסיה וחיסכון</a>.`,
      ],
      faq: [
        [
          "אילו סוגי קבצים אפשר לייבא?",
          "CSV, ‏XLSX ו-XLS. טבלה אפשר גם להדביק ישר לגיליון החכם, ו-PDF או צילום נקראים בעזרת ספק ה-AI שבחרתם.",
        ],
        [
          "מה קורה אם ייבאתי את אותו קובץ פעמיים?",
          "תנועה שכבר קיימת באותו חשבון, באותו סכום ובהפרש של יום לכל היותר, מסומנת ומדולגת. אפשר לכלול אותה בכל זאת אם היא באמת תנועה נפרדת.",
        ],
        [
          "אפשר לעבור מאפליקציה אחרת או מ-Excel?",
          "כן. מייצאים משם קובץ CSV או Excel ומייבאים, או מדביקים את הטבלה לגיליון החכם וממפים את העמודות.",
        ],
        [
          "צריך AI בשביל לייבא?",
          "לא. קובצי CSV ו-Excel והגיליון החכם עובדים בלי AI. רק קריאה של PDF, צילום או טקסט חופשי צריכה ספק AI.",
        ],
      ],
    },
    en: {
      h1: "Whatever your bank exports, comes in.",
      desc: "Import CSV and Excel statements, a folder that imports on its own, a smart sheet for pasted tables, and PDFs or photos your AI reads. No duplicates.",
      intro:
        "For accounts without automatic sync, for months the bank no longer shows, or if you'd rather not hand over a password. Importing a file always works, even when a bank changes its website.",
      sections: [
        {
          h: "Statements as CSV, XLSX and XLS",
          p: "Download the file from your bank or card company, pick the account and upload it. No passwords and no access to the account.",
          shot: "demo/transactions",
          alt: "Transactions after an import, grouped by week",
        },
        {
          h: "A folder that imports on its own",
          p: "Penny watches a folder on your computer, with one subfolder per account. A file dropped there is imported and moved to the imported folder, and if something fails it is set aside with a note saying why.",
        },
        {
          h: "The smart sheet",
          p: "Paste a table as it is, from Excel, Google Sheets or a list you typed.",
          list: [
            "The header row is detected on its own: date, description, amount, account, category, tags and more",
            "Every cell can be edited in place before saving",
            "The whole import can be undone in one click",
          ],
        },
        {
          h: "PDF, photo or text",
          p: "A PDF statement, a photo of one, a receipt or a message: the AI provider you chose reads it and pulls out the transactions.",
        },
        {
          h: "Nothing is counted twice",
          p: "A transaction that already exists on the same account, for the same amount and at most a day apart, is recognised and not saved again. When one arrives from both sync and a file, the synced copy stays, with your category, notes and tags.",
        },
      ],
      know: [
        "Categories are suggested from merchants you've already taught, and from a built-in dictionary of Israeli merchants.",
        "In Docker the import folder is imports, next to the docker-compose file.",
        `An agent's pension report is imported separately, as a JSON file. <a href="feature-pension-savings.html">More on pension and savings</a>.`,
      ],
      faq: [
        [
          "Which file types can I import?",
          "CSV, XLSX and XLS. A table can also be pasted straight into the smart sheet, and a PDF or photo is read with the AI provider you chose.",
        ],
        [
          "What if I import the same file twice?",
          "A transaction that already exists on the same account, for the same amount and at most a day apart, is marked and skipped. You can still include it if it really is a separate transaction.",
        ],
        [
          "Can I move over from another app or from Excel?",
          "Yes. Export a CSV or Excel file from it and import that, or paste the table into the smart sheet and map the columns.",
        ],
        [
          "Do I need AI to import?",
          "No. CSV and Excel files and the smart sheet work without AI. Only reading a PDF, a photo or free text needs an AI provider.",
        ],
      ],
    },
  },
  {
    id: "budgets",
    slug: "budgeting",
    demo: "/budget",
    related: ["forecasts", "transactions", "telegram"],
    he: {
      h1: "תקציב שמראה את הקצב, לא רק את הסכום.",
      desc: "תקציב לכל קטגוריה שנבנה מהממוצע שלכם, קצב הוצאה לאורך החודש, מעטפות ותצוגת 50/30/20, מעקבים לתקופה וסיכומים לחודש, רבעון ושנה.",
      intro:
        "לכל קטגוריה תקציב, כמה יצא וכמה נשאר. Penny מראה גם אם אתם בקצב הנכון, כך שרואים בעיה כבר באמצע החודש ולא בסופו.",
      sections: [
        {
          h: "תקציב לכל קטגוריה, בלחיצה",
          p: "לא חייבים להתחיל מדף ריק: אפשר לבנות את התקציב מהממוצע שלכם בלחיצה אחת, ואז לתקן איפה שרוצים.",
          shot: "demo/budget",
          alt: "תקציב לפי קטגוריה, עם כמה יצא וכמה נשאר",
        },
        {
          h: "קצב לאורך החודש",
          p: "לכל קטגוריה רואים לא רק כמה נשאר אלא גם אם קצב ההוצאה מתאים לימים שנשארו בחודש.",
        },
        {
          h: "מעטפות, טבלה ו-50/30/20",
          p: "אותו תקציב בכמה תצוגות, לפי מה שנוח לכם.",
          list: [
            "מעטפות: כמה מההכנסה כבר קיבל תפקיד",
            "50/30/20: צרכים, רצונות וחיסכון",
            "טבלה, ופירוט לכל קטגוריה",
          ],
        },
        {
          h: "מעקב לתקופה",
          p: "רוצים לשים עין על משהו אחד? מגדירים מעקב לתקופה, למשל אוכל בחוץ עד סוף החודש.",
        },
        {
          h: "סיכומים לחודש, רבעון, חצי שנה ושנה",
          p: "כמה נכנס, כמה יצא וכמה נשאר בכל תקופה, עם שיעור החיסכון ולאן הלך הכסף.",
          shot: "assets/shots/summary",
          alt: "סיכום רבעוני: הכנסות, הוצאות ושיעור חיסכון",
        },
      ],
      know: [
        "אחרי כל סנכרון, בוט הטלגרם מספר על ההוצאות החדשות ומה נשאר בתקציב של כל אחת.",
        "הוצאה מתוכננת (טיול, מכשיר, תיקון) נכתבת פעם אחת, נכנסת לתחזית ומתאימה את עצמה לחיוב האמיתי.",
        "לתנועה שחלקה עסקי מסמנים אחוז עסקי, והדוחות האישיים מציגים רק את החלק של הבית.",
      ],
      faq: [
        [
          "צריך לבנות תקציב מאפס?",
          "לא. אפשר לבנות אותו מהממוצע שלכם בלחיצה, ולשנות כל קטגוריה אחר כך.",
        ],
        [
          "התקציב עובד גם בלי סנכרון בנקים?",
          "כן. הוא נבנה מהתנועות שבאפליקציה, ולא משנה אם הן הגיעו מסנכרון, מקובץ או מהוספה ידנית.",
        ],
        [
          "אפשר לנהל תקציב משותף לבני זוג?",
          "כן. כל הפרופילים חולקים משק בית אחד משותף, ולכל אחד סידור המסך שלו.",
        ],
        [
          "איך יודעים שחורגים לפני סוף החודש?",
          "לפי הקצב: לכל קטגוריה רואים אם ההוצאה עד היום מתאימה לחלק של החודש שכבר עבר.",
        ],
      ],
    },
    en: {
      h1: "A budget that shows the pace, not just the total.",
      desc: "A budget per category built from your own average, spending pace through the month, envelopes and a 50/30/20 view, trackers for a period, and summaries by month, quarter and year.",
      intro:
        "Each category has a budget, what was spent and what is left. Penny also shows whether you're on pace, so you see a problem in the middle of the month and not at the end.",
      sections: [
        {
          h: "A budget per category, in one click",
          p: "You don't have to start from a blank page: build the budget from your own average in one click, then adjust where you want.",
          shot: "demo/budget",
          alt: "Budget by category, with spent and remaining",
        },
        {
          h: "Pace through the month",
          p: "For each category you see not only what is left, but whether your spending pace fits the days remaining in the month.",
        },
        {
          h: "Envelopes, a table and 50/30/20",
          p: "The same budget in several views, whichever suits you.",
          list: [
            "Envelopes: how much of your income already has a job",
            "50/30/20: needs, wants and savings",
            "A table, and detail per category",
          ],
        },
        {
          h: "Trackers for a period",
          p: "Want to keep an eye on one thing? Set a tracker for a period, such as eating out until the end of the month.",
        },
        {
          h: "Summaries by month, quarter, half-year and year",
          p: "What came in, what went out and what was left in each period, with your savings rate and where the money went.",
          shot: "assets/shots/summary",
          alt: "Quarterly summary: income, spending and savings rate",
        },
      ],
      know: [
        "After every sync, the Telegram bot tells you about new expenses and what is left in each one's budget.",
        "A planned expense (a trip, a device, a repair) is written once, joins the forecast and matches itself to the real charge.",
        "A transaction that is partly work gets a business percentage, and personal reports show only the household's share.",
      ],
      faq: [
        [
          "Do I have to build a budget from scratch?",
          "No. You can build it from your own average in one click and change any category afterwards.",
        ],
        [
          "Does the budget work without bank sync?",
          "Yes. It is built from the transactions in the app, whether they came from sync, a file or manual entry.",
        ],
        [
          "Can a couple share one budget?",
          "Yes. All profiles share one household, and each person keeps their own screen layout.",
        ],
        [
          "How do I know I'm overspending before the month ends?",
          "By the pace: for each category you see whether spending so far fits the part of the month that has passed.",
        ],
      ],
    },
  },
  {
    id: "pension",
    slug: "pension-savings",
    demo: "/accounts",
    related: ["investments", "networth", "insurance"],
    he: {
      h1: "פנסיה, השתלמות וגמל, ליד הכסף של היום-יום.",
      desc: "יתרות פנסיה, קרן השתלמות וגמל שמסתנכרנות משמונה גופים, ייבוא דוח הסוכן, דמי הניהול שלכם מול השוק וכלים לבחירת מסלול, קצבה או היוון.",
      intro:
        "החיסכון לטווח ארוך מפסיק להיות מכתב פעם בשנה. היתרות מסתנכרנות לבד, דמי הניהול נבדקים מול השוק, והכול נכנס לשווי הנקי של הבית.",
      sections: [
        {
          h: "יתרות שמסתנכרנות משמונה גופים",
          p: "מחברים את גוף הפנסיה או בית ההשקעות פעם אחת, והיתרה מתעדכנת לבד.",
          embed: "houses",
          shot: "demo/accounts",
          alt: "פנסיה, קרן השתלמות ותיק השקעות ברשימת החשבונות",
        },
        {
          h: "ייבוא דוח הסוכן",
          p: "דוח תקופתי מסוכן או מיועץ מיובא כקובץ JSON.",
          list: [
            "כל מוצר נכנס לנכסים, עם השווי שלו בתאריך הדוח",
            "דמי הניהול וההפקדה החודשית נשמרים איתו",
            "כל פוליסה בדוח נכנסת לביטוחים",
            "ייבוא חוזר של אותו דוח מעדכן, ולא יוצר כפילות",
          ],
        },
        {
          h: "דמי הניהול שלכם מול השוק",
          p: 'Penny משווה את דמי הניהול שלכם למה שמקובל בשוק. מה שגבוה מדי מופיע ב"כסף על השולחן", עם הסכום השנתי והצעד הבא.',
          shot: "demo/savings",
          alt: "כסף על השולחן: דמי ניהול גבוהים בפנסיה ובקרן ההשתלמות",
        },
        {
          h: "כלים להחלטות על פנסיה",
          p: "מחשבונים וכלים מודרכים, כל אחד עם השנה שהנתונים שלו תקפים לה.",
          list: [
            "בחירת מסלול השקעה",
            "קצבה או היוון",
            "פיצויים כשמחליפים עבודה",
            "גשר לפרישה מוקדמת עד גיל 67",
            "הפקדות שמזכות בהטבת מס",
          ],
          shot: "assets/shots/calculators",
          alt: "המחשבונים, מסודרים לפי שלב בחיים",
        },
      ],
      know: [
        "Penny לא קוראת קובצי PDF של דוח הסוכן. כל כלי שמוציא את הנתונים ל-JSON במבנה שבדוגמה מתאים.",
        "קריאה אוטומטית של דוח המסלקה הפנסיונית עדיין בתוכנית העבודה. בינתיים יש באפליקציה מדריך לקריאת הדוח.",
        "המחשבונים נותנים הערכה, לא ייעוץ פנסיוני.",
        "הדוח נקרא ונשמר על המחשב שלכם, ושום דבר ממנו לא יוצא החוצה.",
      ],
      faq: [
        [
          "מאילו גופים היתרות מסתנכרנות?",
          "אלטשולר שחם, הפניקס, אקסלנס טרייד, כלל, הראל, מיטב, מנורה ומגדל.",
        ],
        [
          "הגוף שלי לא ברשימה. מה עושים?",
          `מייבאים את דוח הסוכן כקובץ JSON, והמוצרים נכנסים לנכסים עם השווי, דמי הניהול וההפקדות. <a href="${GH}/blob/main/docs/pension-report.md">מבנה הקובץ</a>.`,
        ],
        [
          "Penny קוראת את דוח המסלקה הפנסיונית?",
          "עדיין לא. זה בתוכנית העבודה. היום אפשר לייבא את דוח הסוכן, ויש מדריך לקריאת דוח המסלקה.",
        ],
        [
          "זה ייעוץ פנסיוני?",
          "לא. Penny מציגה את הנתונים שלכם ונותנת הערכות. היא לא שירות מורשה ולא מחליפה יועץ.",
        ],
      ],
    },
    en: {
      h1: "Pension, study fund and provident fund, next to everyday money.",
      desc: "Pension, study fund and provident fund balances synced from eight houses, agent report import, your fees against the market, and tools for choosing a track or annuity versus lump sum.",
      intro:
        "Long-term savings stop being a letter once a year. Balances sync on their own, fees are checked against the market, and all of it counts toward the household's net worth.",
      sections: [
        {
          h: "Balances synced from eight houses",
          p: "Connect your pension provider or investment house once, and the balance updates on its own.",
          embed: "houses",
          shot: "demo/accounts",
          alt: "Pension, study fund and an investment portfolio in the accounts list",
        },
        {
          h: "Import your agent's report",
          p: "A periodic report from an agent or advisor is imported as a JSON file.",
          list: [
            "Each product lands in assets, valued as of the report date",
            "Its management fees and monthly deposit are stored with it",
            "Each policy in the report lands in insurance",
            "Importing the same report again updates it instead of duplicating",
          ],
        },
        {
          h: "Your fees against the market",
          p: 'Penny compares your management fees with what is usual in the market. Anything too high shows up in "Money on the table", with the yearly amount and the next step.',
          shot: "demo/savings",
          alt: "Money on the table: high fees on a pension and a study fund",
        },
        {
          h: "Tools for pension decisions",
          p: "Calculators and guided tools, each marked with the year its figures are valid for.",
          list: [
            "Choosing an investment track",
            "Annuity versus lump sum",
            "Severance when changing jobs",
            "An early-retirement bridge to 67",
            "Deposits that earn a tax benefit",
          ],
          shot: "assets/shots/calculators",
          alt: "The calculators, ordered by life stage",
        },
      ],
      know: [
        "Penny does not read PDF agent reports. Any tool that extracts the data to JSON in the example's shape works.",
        "Reading the pension clearing-house report automatically is still on the roadmap. For now the app has a guide to reading it.",
        "Calculators give estimates, not pension advice.",
        "The report is read and stored on your computer, and none of it leaves.",
      ],
      faq: [
        [
          "Which houses do balances sync from?",
          "Altshuler Shaham, Phoenix, Excellence Trade, Clal, Harel, Meitav, Menora and Migdal.",
        ],
        [
          "Mine isn't listed. What now?",
          `Import your agent's report as a JSON file, and the products land in assets with their value, fees and deposits. <a href="${GH}/blob/main/docs/pension-report.md">The file format</a>.`,
        ],
        [
          "Does Penny read the pension clearing-house report?",
          "Not yet. It is on the roadmap. Today you can import your agent's report, and there is a guide to reading the clearing-house one.",
        ],
        [
          "Is this pension advice?",
          "No. Penny shows your own data and gives estimates. It is not a licensed service and does not replace an advisor.",
        ],
      ],
    },
  },
  {
    id: "telegram",
    slug: "telegram-bot",
    related: ["budgets", "banks", "privacy"],
    he: {
      h1: "הכסף שלכם, בצ'אט בטלגרם.",
      desc: "בוט טלגרם פרטי שמדבר עם Penny שעל המחשב שלכם: סיכום שלוש פעמים בשבוע, משוב אחרי כל סנכרון, תזכורות לפני חיובים והתראות כשבנק מפסיק להסתנכרן.",
      intro:
        "מחברים בוט פרטי לצ'אט שלכם עם קוד חד-פעמי מההגדרות. הוא עונה רק לצ'אט הזה, ומדבר עם Penny שעל המחשב שלכם, לא עם שרת שלנו.",
      sections: [
        {
          h: "סיכום שלוש פעמים בשבוע",
          p: "בימי ראשון, שלישי וחמישי בבוקר: כמה פנוי, כמה יצא החודש, ומתי חיובי האשראי הבאים.",
          embed: "chat",
        },
        {
          h: "משוב אחרי כל סנכרון",
          p: "ההוצאות החדשות הגדולות, וליד כל אחת כמה נשאר בתקציב שלה החודש.",
        },
        {
          h: "תזכורות והתראות",
          p: "הבוט מעדכן לפני שמשהו קורה, לא אחרי.",
          list: [
            "חשבונות ומנויים קרובים, לפני שהם יורדים מהחשבון",
            "התראה כשחיבור לבנק מתחיל להיכשל, כשהוא נשאר למטה, וכשהוא חוזר",
          ],
        },
        {
          h: "מסווגים ומוסיפים בדרך",
          p: "מסווגים תנועות חדשות בלחיצה, או מעבירים לבוט הודעת SMS על חיוב בכרטיס והוא שומר אותה כתנועה.",
        },
        {
          h: "לפי בקשה",
          p: "מבקשים מהבוט תמונת מצב, את סיכום החודש, את החיובים הקרובים או סנכרון עכשיו. גם קוד חד-פעמי מהבנק אפשר להקליד בצ'אט.",
        },
      ],
      know: [
        "הבוט עונה רק לצ'אט שחיברתם, ושותק כשהאפליקציה נעולה.",
        "אפשר להסתיר סכומים בצ'אט.",
        "הסיכומים וההתראות עוברים דרך טלגרם. זה אחד הדברים היחידים שיוצאים מהמחשב, ורק אם חיברתם את הבוט.",
        "הבוט פועל כשהמחשב עם Penny דולק.",
      ],
      faq: [
        [
          "איך מחברים את הבוט?",
          "עם קוד חד-פעמי מההגדרות של Penny. מאותו רגע הבוט מחובר לצ'אט שלכם בלבד.",
        ],
        [
          "זה עובד מחוץ לבית?",
          "כן. הבוט הוא החלון החוצה: סיכומים, תזכורות וסנכרון לפי בקשה מכל מקום, בלי לפתוח את האפליקציה לאינטרנט.",
        ],
        [
          "מי רואה את ההודעות?",
          "אתם וטלגרם. ההודעות נשלחות מ-Penny שעל המחשב שלכם ישירות לטלגרם, ואין שרת של Penny באמצע.",
        ],
        [
          "חייבים טלגרם כדי להשתמש ב-Penny?",
          "לא. הכול עובד גם בלי הבוט. הוא תוספת למי שרוצה עדכונים בטלפון.",
        ],
      ],
    },
    en: {
      h1: "Your money, in a Telegram chat.",
      desc: "A private Telegram bot that talks to the Penny on your own computer: a summary three times a week, feedback after every sync, reminders before charges and alerts when a bank stops syncing.",
      intro:
        "Connect a private bot to your chat with a one-time code from Settings. It answers only that chat, and it talks to the Penny on your computer, not to a server of ours.",
      sections: [
        {
          h: "A summary three times a week",
          p: "On Sunday, Tuesday and Thursday mornings: how much is free, how much went out this month, and when the next card charges land.",
          embed: "chat",
        },
        {
          h: "Feedback after every sync",
          p: "The biggest new expenses, each with what is left in its budget this month.",
        },
        {
          h: "Reminders and alerts",
          p: "The bot tells you before something happens, not after.",
          list: [
            "Upcoming bills and subscriptions, before they leave your account",
            "An alert when a bank connection starts failing, when it stays down, and when it recovers",
          ],
        },
        {
          h: "Categorise and add on the go",
          p: "Categorise new transactions with a tap, or forward the bot an SMS about a card charge and it saves it as a transaction.",
        },
        {
          h: "On request",
          p: "Ask the bot for a snapshot, the month's summary, upcoming charges or a sync right now. A one-time code from the bank can be typed in the chat too.",
        },
      ],
      know: [
        "The bot answers only the chat you connected, and stays quiet while the app is locked.",
        "Amounts can be hidden in the chat.",
        "Summaries and alerts pass through Telegram. It is one of the few things that leave your computer, and only if you connected the bot.",
        "The bot works while the computer running Penny is on.",
      ],
      faq: [
        [
          "How do I connect the bot?",
          "With a one-time code from Penny's Settings. From then on the bot is tied to your chat only.",
        ],
        [
          "Does it work away from home?",
          "Yes. The bot is the window out: summaries, reminders and sync on request from anywhere, without opening the app to the internet.",
        ],
        [
          "Who sees the messages?",
          "You and Telegram. Messages go from the Penny on your computer straight to Telegram, with no Penny server in between.",
        ],
        [
          "Do I need Telegram to use Penny?",
          "No. Everything works without the bot. It is an extra for people who want updates on their phone.",
        ],
      ],
    },
  },
  {
    id: "privacy",
    slug: "privacy-security",
    related: ["banks", "ai", "anywhere"],
    he: {
      h1: "הנתונים שלכם לא יוצאים מהבית.",
      desc: "Penny רצה על המחשב שלכם בלבד: מאזינה רק ל-127.0.0.1, מצפינה את סיסמאות הבנק ב-AES-256-GCM, ננעלת בסיסמה, PIN או מפתח גישה, ומגבה בהצפנה.",
      intro:
        "Penny היא תוכנה על המחשב שלכם, לא שירות. אין חשבון משתמש, אין שרת שלנו, ואין מעקב. הנתונים נשמרים בקובץ אחד שאפשר לגבות, לייצא או למחוק.",
      sections: [
        {
          h: "מה נשאר בבית, ומה יוצא",
          p: "Penny מאזינה רק לכתובת 127.0.0.1 וחוסמת בקשות מאתרים אחרים. זה כל מה שיוצא החוצה אי פעם, ורק כי הפעלתם אותו.",
          embed: "ledger",
        },
        {
          h: "סיסמאות הבנק מוצפנות",
          p: "הסיסמאות מוצפנות ב-AES-256-GCM ונשמרות רק על המחשב שלכם. הן נשלחות רק לאתר של הבנק עצמו, בזמן הסנכרון.",
        },
        {
          h: "נעילה",
          p: "נועלים את האפליקציה כדי שמי שיושב מול המחשב לא יראה את הכסף.",
          list: [
            "סיסמה, קוד PIN או מפתח גישה (passkey)",
            "כשהאפליקציה נעולה, מפתח ההצפנה לא נשמר על הדיסק בלי הסיסמה שלכם",
            "נעילה אוטומטית אחרי זמן בלי שימוש",
          ],
        },
        {
          h: "מצב פרטיות",
          p: "קיצור אחד (Ctrl/⌘+Shift+P) מסתיר כל סכום על המסך. שימושי כשמישהו מציץ מעבר לכתף, או כשמשתפים מסך.",
        },
        {
          h: "גיבוי, ייצוא ומחיקה",
          p: "הנתונים שלכם, ואתם מחליטים מה לעשות איתם.",
          list: [
            "גיבוי אוטומטי מוצפן, שנפתח רק עם הסיסמה שלכם",
            "שחזור שמחזיר הכול, כולל הגישה לחשבונות",
            "ייצוא מלא של הנתונים",
            "מחיקה מלאה",
          ],
        },
        {
          h: "קוד פתוח שאפשר לבדוק",
          p: "כל שורה בגיטהאב ברישיון MIT, עם יותר מ-1,200 בדיקות אוטומטיות ועדכונים חתומים.",
        },
      ],
      know: [
        "מומלץ להפעיל הצפנת דיסק (BitLocker או FileVault). מפתח ההצפנה יושב ליד מסד הנתונים, והצפנת הדיסק היא ההגנה האחרונה אם המחשב אובד.",
        "קובצי ההתקנה לא חתומים, ולכן Windows ו-Mac מזהירים בהתקנה הראשונה. העדכונים עצמם חתומים ונבדקים.",
        "גישה מהטלפון ברשת הביתית כבויה כברירת מחדל, ומוגנת בקוד גישה כשמפעילים אותה.",
        "בדיקת העדכונים שואלת את GitHub אם יש גרסה חדשה. אפשר לכבות אותה.",
      ],
      faq: [
        [
          "לאן הנתונים שלי הולכים?",
          "לשום מקום. נתונים יוצאים רק אם בחרתם בזה: לספק AI בענן אם בחרתם בו (או בכלל לא, עם Ollama או בלי AI), ולטלגרם אם חיברתם בוט.",
        ],
        [
          "מישהו ב-Penny יכול לראות את הנתונים שלי?",
          "לא. אין שרת, אין חשבון משתמש ואין מעקב. הכול נשמר בקובץ על המחשב שלכם.",
        ],
        [
          "מה קורה אם המחשב מתקלקל?",
          "מגדירים גיבוי אוטומטי מוצפן לתיקייה ש-Google Drive, ‏OneDrive, ‏Dropbox או iCloud מסנכרנים. הקובץ נפתח רק עם סיסמת הגיבוי, ושחזור מחזיר את כל הנתונים.",
        ],
        [
          "איפה אפשר לקרוא על האבטחה לעומק?",
          `ב<a href="${GH}/blob/main/SECURITY.md">מדיניות האבטחה</a> וב<a href="${GH}/blob/main/docs/security.md">סקירת האבטחה המלאה</a> בגיטהאב.`,
        ],
      ],
    },
    en: {
      h1: "Your data doesn't leave home.",
      desc: "Penny runs only on your own computer: it listens on 127.0.0.1 alone, encrypts bank passwords with AES-256-GCM, locks with a password, PIN or passkey, and backs up encrypted.",
      intro:
        "Penny is software on your computer, not a service. There is no user account, no server of ours and no tracking. Your data lives in one file you can back up, export or delete.",
      sections: [
        {
          h: "What stays home, and what leaves",
          p: "Penny listens only on 127.0.0.1 and blocks requests from other sites. This is everything that ever leaves, and only because you turned it on.",
          embed: "ledger",
        },
        {
          h: "Bank passwords are encrypted",
          p: "Passwords are encrypted with AES-256-GCM and stored only on your computer. They are sent only to the bank's own site, during a sync.",
        },
        {
          h: "A lock",
          p: "Lock the app so whoever sits at the computer doesn't see your money.",
          list: [
            "A password, a PIN or a passkey",
            "While the app is locked, the encryption key isn't on disk without your password",
            "Automatic lock after a period without use",
          ],
        },
        {
          h: "Privacy mode",
          p: "One shortcut (Ctrl/⌘+Shift+P) hides every amount on screen. Handy when someone looks over your shoulder, or when you share your screen.",
        },
        {
          h: "Backup, export and delete",
          p: "Your data, and you decide what happens to it.",
          list: [
            "An automatic encrypted backup that opens only with your password",
            "A restore that brings everything back, including access to accounts",
            "A full export of your data",
            "A full wipe",
          ],
        },
        {
          h: "Open source you can inspect",
          p: "Every line is on GitHub under the MIT licence, with more than 1,200 automated tests and signed updates.",
        },
      ],
      know: [
        "Turn on full-disk encryption (BitLocker or FileVault). The encryption key sits next to the database, so disk encryption is the last line of defence if the computer is lost.",
        "The installers aren't signed, so Windows and Mac warn on first install. Updates themselves are signed and checked.",
        "Phone access on your home network is off by default, and protected by an access code when you turn it on.",
        "The update check asks GitHub whether a new version exists. You can turn it off.",
      ],
      faq: [
        [
          "Where does my data go?",
          "Nowhere. Data leaves only if you chose it: to a cloud AI provider if you picked one (or not at all, with Ollama or no AI), and to Telegram if you connected the bot.",
        ],
        [
          "Can anyone at Penny see my data?",
          "No. There is no server, no user account and no tracking. Everything is stored in a file on your computer.",
        ],
        [
          "What if my computer breaks?",
          "Set up an automatic encrypted backup to a folder that Google Drive, OneDrive, Dropbox or iCloud syncs. The file opens only with your backup password, and a restore brings all your data back.",
        ],
        [
          "Where can I read about security in depth?",
          `In the <a href="${GH}/blob/main/SECURITY.md">security policy</a> and the <a href="${GH}/blob/main/docs/security.md">full security review</a> on GitHub.`,
        ],
      ],
    },
  },
];

export default pages;

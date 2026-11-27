// Feature pages, part 2: transactions, forecasts, money on the table, investments, net worth. Same shape as features-1.mjs.
const pages = [
  {
    id: "transactions",
    slug: "transactions-rules",
    demo: "/transactions",
    related: ["banks", "import", "ai"],
    he: {
      h1: "כל שקל ברשימה אחת, מסווג כמו שלימדתם.",
      desc: "כל התנועות מכל החשבונות ברשימה אחת: מקובצות לפי שבוע, עם חיפוש, סינון, פיצול ותגיות. כללים וזיכרון בתי עסק מסווגים אותן בכל סנכרון.",
      intro:
        "התנועות מכל הבנקים, הכרטיסים והקבצים נכנסות לרשימה אחת. Penny זוכרת איך סיווגתם כל בית עסק, כך שמסדרים פעם אחת ולא כל חודש מחדש.",
      sections: [
        {
          h: "רשימה אחת, מקובצת לפי שבוע",
          p: "כל התנועות בצבעי הקטגוריות שלהן, עם סיכום לכל שבוע ולכל חודש.",
          list: [
            "חיפוש וסינון",
            "עריכה של כמה תנועות יחד",
            'תור "לבדיקה" לתנועות חדשות, עם התחשבנויות בנפרד',
          ],
          shot: "demo/transactions",
          alt: "רשימת התנועות של החודש, מקובצת לפי שבוע, עם קטגוריה ובעלים לכל תנועה",
        },
        {
          h: "פיצול, תגיות ובעלים",
          p: "תנועה אחת יכולה להתחלק לכמה קטגוריות, לקבל תגיות, ולהיות משויכת למי שהוציא אותה.",
          list: [
            "חלק עסקי באחוזים לתנועה שחלקה לעבודה",
            'סימון של מי חייב לכם חלק מההוצאה, ו"החזיר הכול" בלחיצה',
            "קבלות מצורפות לתנועה",
          ],
        },
        {
          h: "כללים שעובדים בכל סנכרון",
          p: "לבתי עסק שחוזרים קובעים כלל פעם אחת. הוא מגדיר קטגוריה, תגיות ובעלים בכל סנכרון ובכל ייבוא.",
        },
        {
          h: "סיווג גם בלי AI",
          p: "תנועה חדשה מקבלת קטגוריה קודם ממה שתיקנתם בעבר לאותו בית עסק, ואחר כך ממילון מובנה של כ-200 בתי עסק ישראליים. AI, אם בחרתם בו, רואה רק את מה שנשאר.",
        },
        {
          h: "מזומן, וייצוא החוצה",
          p: "הוצאה במזומן מוסיפים בשניות, במסך שמתחיל מהסכום. את כל התנועות אפשר לייצא ל-CSV או ל-OFX.",
        },
      ],
      know: [
        "הקטגוריות שלכם: קבוצות ותתי-קטגוריות חולקות משפחת צבעים, ואפשר ליצור קטגוריות משלכם.",
        "לתנועה שחלקה עסקי, הסכום המקורי נשאר בתזרים ובחיובי הכרטיס, והדוחות האישיים מציגים רק את החלק של הבית.",
        `תנועה שמגיעה גם מסנכרון וגם מקובץ נשמרת פעם אחת. <a href="feature-import-files.html">כך עובד הייבוא</a>.`,
      ],
      faq: [
        [
          "צריך לסווג כל תנועה ביד?",
          'לא. כללים, מה שתיקנתם בעבר והמילון המובנה מסווגים את רוב התנועות. מה שנשאר מחכה בתור "לבדיקה".',
        ],
        ["אפשר לפצל תנועה לכמה קטגוריות?", "כן. תנועה מתפצלת לכמה חלקים, ולכל אחד קטגוריה משלו."],
        [
          "איך מוסיפים הוצאה במזומן?",
          "במסך הוספה קצר שמתחיל מהסכום. התנועה נשמרת כתנועה ידנית שאפשר תמיד לערוך.",
        ],
        ["אפשר להוציא את הנתונים החוצה?", "כן. כל התנועות מיוצאות ל-CSV או ל-OFX."],
      ],
    },
    en: {
      h1: "Every shekel in one list, sorted the way you taught it.",
      desc: "All transactions from every account in one list: grouped by week, with search, filters, splits and tags. Rules and merchant memory sort them on every sync.",
      intro:
        "Transactions from every bank, card and file land in one list. Penny remembers how you categorised each merchant, so you tidy up once and not every month again.",
      sections: [
        {
          h: "One list, grouped by week",
          p: "Every transaction in its category colour, with a total for each week and each month.",
          list: [
            "Search and filters",
            "Edit several transactions at once",
            'A "to review" queue for new transactions, with settlements kept apart',
          ],
          shot: "demo/transactions",
          alt: "The month's transactions, grouped by week, each with a category and an owner",
        },
        {
          h: "Splits, tags and an owner",
          p: "One transaction can be split across categories, carry tags, and belong to whoever spent it.",
          list: [
            "A business percentage for a transaction that is partly work",
            'Mark who owes you part of an expense, and "paid it all back" in one tap',
            "Receipts attached to the transaction",
          ],
        },
        {
          h: "Rules that run on every sync",
          p: "For merchants that come back, set a rule once. It sets category, tags and owner on every sync and every import.",
        },
        {
          h: "Sorted even without AI",
          p: "A new transaction gets its category first from what you corrected before for that merchant, then from a built-in dictionary of about 200 Israeli merchants. AI, if you chose one, only sees what is left.",
        },
        {
          h: "Cash, and export",
          p: "A cash expense is added in seconds, in a sheet that starts with the amount. All transactions can be exported to CSV or OFX.",
        },
      ],
      know: [
        "The categories are yours: groups and subcategories share a colour family, and you can create your own.",
        "For a transaction that is partly work, the original amount stays in the cash flow and card charges, and personal reports show only the household's share.",
        `A transaction that arrives from both sync and a file is stored once. <a href="feature-import-files.html">How importing works</a>.`,
      ],
      faq: [
        [
          "Do I have to categorise every transaction by hand?",
          'No. Rules, what you corrected before and the built-in dictionary sort most transactions. The rest waits in the "to review" queue.',
        ],
        [
          "Can I split a transaction across categories?",
          "Yes. A transaction splits into several parts, each with its own category.",
        ],
        [
          "How do I add a cash expense?",
          "In a short sheet that starts with the amount. It is saved as a manual transaction you can always edit.",
        ],
        ["Can I get my data out?", "Yes. All transactions export to CSV or OFX."],
      ],
    },
  },
  {
    id: "forecasts",
    slug: "forecasts-insights",
    demo: "/overview?tab=ahead",
    related: ["budgets", "table", "telegram"],
    he: {
      h1: "כמה יישאר, ומה עוד בדרך.",
      desc: "תחזית יתרה לכל חשבון בנק, חיובים קבועים ומנויים שנמצאים לבד, תשלומים שנותרו, הוצאות מתוכננות, והסבר למה ההוצאות השתנו.",
      intro:
        "Penny מסתכלת קדימה: מה היתרה הצפויה בכל חשבון, אילו חיובים עוד יגיעו החודש ובחודש הבא, ומה השתנה בהוצאות לעומת התקופה הקודמת.",
      sections: [
        {
          h: "תחזית יתרה לכל חשבון",
          p: "לכל חשבון בנק תחזית נפרדת, עם טווח אפשרי להערכות. לכל כרטיס אשראי יש כרטיס משלו, ליד החשבון שמשלם אותו.",
          shot: "assets/shots/ahead",
          alt: "מה צפוי: חיובי האשראי בשלושים הימים הקרובים ותחזית היתרה לתשעים יום",
        },
        {
          h: "חיובים קבועים ומנויים, שנמצאים לבד",
          p: "Penny מזהה חיובים שחוזרים ומנויים מתוך התנועות, ומציגה אותם בלוח שנה של מה שעוד יגיע החודש ובחודש הבא.",
        },
        {
          h: "תשלומים והתחייבויות",
          p: "כמה תשלומים נותרו על כל עסקה, ואילו התחייבויות מתקרבות, כדי שחיוב גדול לא יפתיע.",
        },
        {
          h: "הוצאות מתוכננות",
          p: "קנייה שיודעים שהיא בדרך (טיול, מכשיר, תיקון) נכתבת פעם אחת, נכנסת לתחזית, ומתאימה את עצמה לחיוב האמיתי כשהוא מגיע.",
        },
        {
          h: "למה ההוצאות השתנו",
          p: "החודש מול אותם ימים בחודש שעבר או בשנה שעברה, לפי בית עסק.",
          list: [
            "מחיר שעלה או כמות שגדלה",
            "בית עסק חדש, או אחד שנעלם",
            "הוצאה חד-פעמית",
            "חריגות בהוצאות מסומנות",
          ],
        },
      ],
      know: [
        "התחזית היא הערכה לפי התנועות שלכם, לא ייעוץ פיננסי.",
        `בוט הטלגרם מזכיר על חשבונות ומנויים קרובים לפני שהם יורדים מהחשבון. <a href="feature-telegram-bot.html">עוד על הבוט</a>.`,
        "התחזית מתעדכנת עם כל סנכרון או ייבוא, ולכן היא טובה כמו הנתונים שנכנסו.",
      ],
      faq: [
        [
          "צריך להזין את החיובים הקבועים ביד?",
          "לא. חיובים קבועים ומנויים מזוהים לבד מתוך התנועות.",
        ],
        [
          "מה ההבדל בין חיוב קבוע להוצאה מתוכננת?",
          "חיוב קבוע מזוהה מהעבר. הוצאה מתוכננת היא משהו שאתם יודעים שיגיע, כותבים פעם אחת, והיא מתאימה את עצמה לחיוב האמיתי.",
        ],
        [
          "התחזית היא לכל החשבונות יחד?",
          "יש תחזית נפרדת לכל חשבון בנק, עם טווח, וכרטיסי האשראי מוצגים ליד החשבון שמשלם אותם.",
        ],
        [
          "איך יודעים למה החודש יצא יקר יותר?",
          "ההשוואה לפי בית עסק מראה מה השתנה: מחיר, כמות, משהו חדש או חד-פעמי.",
        ],
      ],
    },
    en: {
      h1: "What will be left, and what is on its way.",
      desc: "A balance forecast for each bank account, recurring charges and subscriptions found automatically, remaining installments, planned expenses, and why spending changed.",
      intro:
        "Penny looks ahead: the expected balance on each account, the charges still to come this month and next, and what changed in your spending against the period before.",
      sections: [
        {
          h: "A balance forecast for each account",
          p: "Each bank account has its own forecast, with a possible range for the estimates. Each credit card has a card of its own, next to the account that pays it.",
          shot: "assets/shots/ahead",
          alt: "What's ahead: card charges in the next thirty days and the balance forecast for ninety days",
        },
        {
          h: "Recurring charges and subscriptions, found automatically",
          p: "Penny spots repeating charges and subscriptions in your transactions, and shows them on a calendar of what is still to come this month and next.",
        },
        {
          h: "Installments and obligations",
          p: "How many installments remain on each purchase, and which obligations are coming up, so a large charge doesn't surprise you.",
        },
        {
          h: "Planned expenses",
          p: "A purchase you know is coming (a trip, a device, a repair) is written once, joins the forecast, and matches itself to the real charge when it arrives.",
        },
        {
          h: "Why spending changed",
          p: "This month against the same days last month or last year, per merchant.",
          list: [
            "A price that went up, or a larger volume",
            "A new merchant, or one that is gone",
            "A one-off expense",
            "Spending anomalies are flagged",
          ],
        },
      ],
      know: [
        "The forecast is an estimate from your own transactions, not financial advice.",
        `The Telegram bot reminds you of upcoming bills and subscriptions before they leave your account. <a href="feature-telegram-bot.html">More on the bot</a>.`,
        "The forecast updates with every sync or import, so it is as good as the data that came in.",
      ],
      faq: [
        [
          "Do I have to enter recurring charges by hand?",
          "No. Recurring charges and subscriptions are found automatically in your transactions.",
        ],
        [
          "What is the difference between a recurring charge and a planned expense?",
          "A recurring charge is recognised from the past. A planned expense is something you know is coming: you write it once and it matches itself to the real charge.",
        ],
        [
          "Is the forecast for all accounts together?",
          "Each bank account has its own forecast, with a range, and credit cards are shown next to the account that pays them.",
        ],
        [
          "How do I find out why this month cost more?",
          "The per-merchant comparison shows what changed: price, volume, something new or a one-off.",
        ],
      ],
    },
  },
  {
    id: "table",
    slug: "money-on-the-table",
    demo: "/optimizations",
    related: ["pension", "insurance", "tools"],
    he: {
      h1: "סכום שנתי אחד לכל מה שאפשר לחסוך.",
      desc: "כסף על השולחן: עמלות בנק, ריבית על מינוס, עמלת המרה, דמי ניהול מעל השוק, ביטוח כפול, כסף שיושב בלי תשואה וזיכוי על תרומות, בסכום שנתי אחד עם צעד הבא לכל אחד.",
      intro:
        "Penny עוברת על התנועות והנתונים שלכם ומחפשת איפה אתם משלמים יותר ממה שצריך. התוצאה היא מספר שנתי אחד, ורשימה קצרה של מה לעשות איתו.",
      sections: [
        {
          h: "מספר אחד, ורשימה שמרכיבה אותו",
          p: "בראש המסך הסכום השנתי, ומתחתיו כל סעיף עם הסכום שלו, הסבר קצר ומה לעשות.",
          shot: "demo/savings",
          alt: 'כסף על השולחן: סכום שנתי, ומתחתיו ביטוחים חופפים, דמי ניהול גבוהים וכסף שיושב בעו"ש',
        },
        {
          h: "מה נבדק",
          p: "הבדיקה מכסה את המקומות שבהם בתים בישראל מפסידים כסף בלי לשים לב.",
          list: [
            "עמלות בנק, ריבית על מינוס ועמלת המרה",
            "דמי ניהול מעל השוק בפנסיה, בגמל ובהשתלמות",
            "ביטוחים חופפים",
            "כסף שיושב בלי תשואה",
            "זיכוי מס על תרומות (סעיף 46)",
          ],
        },
        {
          h: "צעד הבא לכל סעיף",
          p: "לכל סעיף יש צעד הבא ברור. מה שסימנתם כבוצע נספר כחיסכון, כך שרואים גם כמה כבר חסכתם.",
        },
        {
          h: "ציון בריאות פיננסית",
          p: "ציון אחד לבריאות הפיננסית של הבית, וכפתור אזהרות אחד שמרכז את כל מה שצריך טיפול.",
        },
      ],
      know: [
        "זו הערכה לפי התנועות והנתונים שלכם, לא ייעוץ פיננסי. דמי הניהול מושווים לרמה מקובלת בשוק.",
        "הבדיקה טובה כמו הנתונים: בלי יתרות פנסיה או רשימת ביטוחים, הסעיפים האלה לא יופיעו.",
        `דמי הניהול מגיעים מיתרות הפנסיה ומדוח הסוכן. <a href="feature-pension-savings.html">עוד על פנסיה וחיסכון</a>.`,
      ],
      faq: [
        [
          "מאיפה מגיע הסכום?",
          "מהתנועות ומהנתונים שכבר ב-Penny: עמלות וריביות שירדו מהחשבון, דמי הניהול שלכם, רשימת הביטוחים והיתרות.",
        ],
        [
          "Penny מבצעת את השינוי בשבילי?",
          "לא. היא מראה מה אפשר לחסוך ומה הצעד הבא, ואתם מבצעים אותו מול הבנק, הקופה או חברת הביטוח.",
        ],
        ["מה קורה כשטיפלתי בסעיף?", "מסמנים אותו כבוצע, והסכום שלו נספר כחיסכון."],
        ["זה ייעוץ פיננסי?", "לא. זו הערכה שנועדה להראות לכם איפה כדאי לבדוק."],
      ],
    },
    en: {
      h1: "One yearly figure for everything you could save.",
      desc: "Money on the table: bank fees, overdraft interest, FX markup, fund fees above the market, overlapping insurance, idle cash and the donation tax credit, in one yearly figure with a next step for each.",
      intro:
        "Penny goes over your transactions and data looking for where you pay more than you need to. The result is one yearly number, and a short list of what to do about it.",
      sections: [
        {
          h: "One number, and the list behind it",
          p: "The yearly figure sits on top, and under it each item with its amount, a short explanation and what to do.",
          shot: "demo/savings",
          alt: "Money on the table: a yearly figure, with overlapping insurance, high fund fees and idle cash listed under it",
        },
        {
          h: "What is checked",
          p: "The check covers the places where Israeli households lose money without noticing.",
          list: [
            "Bank fees, overdraft interest and FX markup",
            "Fees above the market on pension, provident and study funds",
            "Overlapping insurance",
            "Idle cash",
            "The tax credit on donations (section 46)",
          ],
        },
        {
          h: "A next step for each item",
          p: "Every item has a clear next step. What you mark done counts as saved, so you also see how much you've already saved.",
        },
        {
          h: "A financial health score",
          p: "One score for the household's financial health, and one warnings button that lists everything that needs care.",
        },
      ],
      know: [
        "This is an estimate from your own transactions and data, not financial advice. Fees are compared with a usual market level.",
        "The check is as good as the data: without pension balances or an insurance list, those items won't appear.",
        `Fund fees come from your pension balances and your agent's report. <a href="feature-pension-savings.html">More on pension and savings</a>.`,
      ],
      faq: [
        [
          "Where does the figure come from?",
          "From the transactions and data already in Penny: fees and interest that left your account, your fund fees, your insurance list and your balances.",
        ],
        [
          "Does Penny make the change for me?",
          "No. It shows what you could save and the next step, and you carry it out with the bank, the fund or the insurer.",
        ],
        [
          "What happens once I've dealt with an item?",
          "Mark it done, and its amount counts as saved.",
        ],
        [
          "Is this financial advice?",
          "No. It is an estimate meant to show you where it is worth checking.",
        ],
      ],
    },
  },
  {
    id: "investments",
    slug: "investments-markets",
    demo: "/investments",
    related: ["pension", "networth", "privacy"],
    he: {
      h1: "אחזקות ליד הכסף של היום-יום, בכל מטבע.",
      desc: 'אחזקות עם קניות ומכירות, פיזור לפי סוג ומטבע בהשוואה ל-S&P 500 ולת"א-125, מדדים, מטבעות וסחורות, והשקעות פרטיות.',
      intro:
        'תיק ההשקעות יושב באותו מקום עם העו"ש והכרטיסים, כך שרואים את כל הכסף יחד ולא בחמש אפליקציות שונות.',
      sections: [
        {
          h: "אחזקות, קניות ומכירות",
          p: "לכל אחזקה רושמים קניות ומכירות, ורואים את השווי שלה היום מול מה שהושקע בה.",
          shot: "demo/investments",
          alt: "נכסים והתחייבויות: פנסיה, תיק השקעות וקרן השתלמות, והשווי הנקי לאורך זמן",
        },
        {
          h: "יתרה שמסתנכרנת",
          p: "יתרת חשבון ההשקעות באקסלנס טרייד מסתנכרנת לבד, יחד עם יתרות הפנסיה והחיסכון.",
        },
        {
          h: "פיזור, מול המדדים",
          p: 'רואים איך התיק מתחלק לפי סוג נכס ולפי מטבע, ואיך הוא עומד בהשוואה ל-S&P 500 ולת"א-125.',
        },
        {
          h: "שווקים",
          p: "מדדים, מטבעות וסחורות במסך אחד, ושערי מטבע ומחירי קרנות לאחזקות שלכם.",
        },
        {
          h: "השקעות פרטיות",
          p: "להשקעות שלא נסחרות בבורסה רואים כמה הושקע, כמה עדיין פתוח וכמה כבר מומש.",
        },
      ],
      know: [
        "בשביל שערי השוק נשלח החוצה רק הסימול או שם הסדרה, ל-Yahoo Finance ולאתרי מידע ציבורי, ורק אם אתם עוקבים אחרי השקעות.",
        "Penny מציגה את ההשקעות שלכם. היא לא מבצעת קנייה או מכירה, והיא לא ייעוץ השקעות.",
        `ההשקעות נכנסות לשווי הנקי של הבית. <a href="feature-net-worth-goals.html">עוד על שווי נקי ויעדים</a>.`,
      ],
      faq: [
        [
          "אפשר לקנות ולמכור דרך Penny?",
          "לא. Penny רק מציגה: רושמים בה קניות ומכירות שביצעתם, והיא עוקבת אחרי השווי.",
        ],
        [
          "מאיפה מגיעים המחירים?",
          "שערי מטבע, מדדים ומחירי קרנות מגיעים מ-Yahoo Finance ומאתרי מידע ציבורי. נשלח רק הסימול או שם הסדרה.",
        ],
        [
          "בית ההשקעות שלי לא מסתנכרן. מה עושים?",
          "מוסיפים את האחזקות ורושמים את הקניות והמכירות ביד.",
        ],
        ["יש תמיכה במטבעות זרים?", "כן. האחזקות מוצגות בכל מטבע, והפיזור מחושב גם לפי מטבע."],
      ],
    },
    en: {
      h1: "Holdings next to everyday money, in any currency.",
      desc: "Holdings with buys and sells, allocation by type and currency against the S&P 500 and TA-125, indices, currencies and commodities, and private ventures.",
      intro:
        "Your portfolio sits in the same place as your current account and cards, so you see all your money together and not in five different apps.",
      sections: [
        {
          h: "Holdings, buys and sells",
          p: "For each holding you record buys and sells, and see what it is worth today against what you put in.",
          shot: "demo/investments",
          alt: "Assets and liabilities: a pension, an investment portfolio and a study fund, with net worth over time",
        },
        {
          h: "A balance that syncs",
          p: "Your Excellence Trade brokerage balance syncs on its own, along with pension and savings balances.",
        },
        {
          h: "Allocation, against the indices",
          p: "See how the portfolio divides by asset type and by currency, and how it compares with the S&P 500 and the TA-125.",
        },
        {
          h: "Markets",
          p: "Indices, currencies and commodities on one screen, and FX rates and fund prices for your holdings.",
        },
        {
          h: "Private ventures",
          p: "For investments that aren't traded on an exchange, you see how much was invested, how much is outstanding and how much has been realised.",
        },
      ],
      know: [
        "For market prices only the ticker or series name is sent out, to Yahoo Finance and public data sites, and only if you track investments.",
        "Penny shows your investments. It does not buy or sell, and it is not investment advice.",
        `Investments count toward the household's net worth. <a href="feature-net-worth-goals.html">More on net worth and goals</a>.`,
      ],
      faq: [
        [
          "Can I buy and sell through Penny?",
          "No. Penny only shows: you record the buys and sells you made, and it tracks the value.",
        ],
        [
          "Where do prices come from?",
          "FX rates, indices and fund prices come from Yahoo Finance and public data sites. Only the ticker or series name is sent.",
        ],
        [
          "My investment house doesn't sync. What now?",
          "Add the holdings and record the buys and sells by hand.",
        ],
        [
          "Are foreign currencies supported?",
          "Yes. Holdings are shown in any currency, and allocation is also worked out by currency.",
        ],
      ],
    },
  },
  {
    id: "networth",
    slug: "net-worth-goals",
    demo: "/accounts",
    related: ["investments", "pension", "tools"],
    he: {
      h1: "איפה הבית עומד, ולאן הוא הולך.",
      desc: "שווי נקי לאורך זמן מכל הנכסים וההתחייבויות, הלוואות עם ההתקדמות שלהן, יעדי חיסכון, עצמאות כלכלית ומודל כסף לכל החיים.",
      intro:
        "כל מה שיש לבית וכל מה שהוא חייב, במספר אחד שמתעדכן לבד. ומעליו התכנון: יעדים, עצמאות כלכלית, ומה יקרה עד גיל 90.",
      sections: [
        {
          h: "שווי נקי, מכל החשבונות",
          p: 'עץ חשבונות עם סיכום לכל קבוצה ודף לכל חשבון: בנקים, השקעות וחיסכון, נדל"ן והלוואות. השווי הנקי מחושב מהכול, ונשמר לאורך זמן.',
          shot: "demo/accounts",
          alt: "כל החשבונות: השווי הנקי, הנכסים וההתחייבויות, ועץ החשבונות לפי קבוצה",
        },
        {
          h: "הלוואות ודירוג אשראי",
          p: "לכל הלוואה רואים את ההתקדמות שלה. את דירוג האשראי רושמים ועוקבים אחריו לאורך זמן.",
        },
        {
          h: "יעדי חיסכון שמסתדרים יחד",
          p: "מגדירים יעדים, ו-Penny בודקת שכולם מסתדרים יחד עם מה שאתם מצליחים לחסוך.",
        },
        {
          h: "עצמאות כלכלית",
          p: "מתי ההשקעות יוכלו לכסות את ההוצאות, עם אירועי חיים בדרך וההנחות גלויות על המסך.",
          shot: "assets/shots/fi",
          alt: "עצמאות כלכלית: האם הכסף מספיק עד גיל 90, וכמה שנים נותרו עד עצמאות כלכלית",
        },
        {
          h: "מודל כסף לכל החיים",
          p: "מודל שמריץ את הכסף של הבית עד גיל 90, ומאמן שהופך את המספרים של החודש לעצות לפי סדר חשיבות.",
        },
      ],
      know: [
        "התחזיות והמודל הם הערכה לפי ההנחות שעל המסך, לא ייעוץ פיננסי.",
        "יתרות הבנק, הפנסיה וההשקעות מתעדכנות מהסנכרון. נכסים אחרים, כמו דירה או רכב, מעדכנים ביד.",
        `המחשבונים למשכנתא, לפירעון חוב ולחיסכון נמצאים באותה אפליקציה. <a href="feature-israeli-money-tools.html">כלים לכסף בישראל</a>.`,
      ],
      faq: [
        [
          "מה נכנס לשווי הנקי?",
          'כל הנכסים וכל ההתחייבויות שב-Penny: חשבונות בנק, השקעות, פנסיה וחיסכון, נדל"ן, והלוואות וחובות.',
        ],
        [
          "צריך לעדכן את השווי ביד?",
          "יתרות שמסתנכרנות מתעדכנות לבד. נכסים שאין להם סנכרון מעדכנים ביד.",
        ],
        [
          "מה זה עצמאות כלכלית כאן?",
          "הנקודה שבה ההשקעות יכולות לכסות את ההוצאות שלכם. Penny מעריכה מתי תגיעו אליה, לפי ההנחות שעל המסך.",
        ],
        ["זה ייעוץ פיננסי?", "לא. אלה הערכות לפי הנתונים וההנחות שלכם, והן לא מחליפות יועץ."],
      ],
    },
    en: {
      h1: "Where the household stands, and where it's heading.",
      desc: "Net worth over time from every asset and liability, loans with their progress, savings goals, financial independence and a lifetime money model.",
      intro:
        "Everything the household owns and everything it owes, in one number that updates on its own. And on top of it, the planning: goals, financial independence, and what happens up to age 90.",
      sections: [
        {
          h: "Net worth, from every account",
          p: "An accounts tree with a total per group and a page per account: banks, investments and savings, property and loans. Net worth is worked out from all of it, and kept over time.",
          shot: "demo/accounts",
          alt: "All accounts: net worth, assets and liabilities, and the accounts tree by group",
        },
        {
          h: "Loans and credit score",
          p: "Each loan shows its progress. Your credit score is recorded and followed over time.",
        },
        {
          h: "Savings goals that fit together",
          p: "Set your goals, and Penny checks that they all fit together with what you manage to save.",
        },
        {
          h: "Financial independence",
          p: "When your investments can cover your spending, with life events along the way and the assumptions in plain view.",
          shot: "assets/shots/fi",
          alt: "Financial independence: whether the money lasts to age 90, and the years left until financial independence",
        },
        {
          h: "A lifetime money model",
          p: "A model that runs the household's money to age 90, and a coach that turns the month's numbers into ranked advice.",
        },
      ],
      know: [
        "The forecasts and the model are estimates from the assumptions on screen, not financial advice.",
        "Bank, pension and investment balances update from sync. Other assets, such as a home or a car, are updated by hand.",
        `The mortgage, debt payoff and savings calculators are in the same app. <a href="feature-israeli-money-tools.html">Israeli money tools</a>.`,
      ],
      faq: [
        [
          "What counts toward net worth?",
          "Every asset and liability in Penny: bank accounts, investments, pension and savings, property, and loans and debts.",
        ],
        [
          "Do I have to update the value by hand?",
          "Balances that sync update on their own. Assets without sync are updated by hand.",
        ],
        [
          "What does financial independence mean here?",
          "The point where your investments can cover your spending. Penny estimates when you'll reach it, from the assumptions on screen.",
        ],
        [
          "Is this financial advice?",
          "No. These are estimates from your own data and assumptions, and they don't replace an advisor.",
        ],
      ],
    },
  },
];

export default pages;

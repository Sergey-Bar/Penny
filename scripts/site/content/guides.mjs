// How-to guides for the website: website/guide-<slug>.html. Menu paths and button labels follow the app's own UI strings.
const DOCS = "https://github.com/Sergey-Bar/Penny/blob/main/docs";

const pages = [
  {
    slug: "connect-your-first-bank",
    related: ["banks", "import", "privacy"],
    he: {
      title: "חיבור בנק ראשון",
      h1: "איך מחברים בנק ראשון ורואים את התנועות.",
      desc: "מהתקנה ועד סנכרון אוטומטי ראשון: בחירת בנק או חברת אשראי, הזנת פרטי הכניסה, קוד חד-פעמי, וסנכרון יומי. ומה עושים כשהחיבור לא עובד.",
      intro:
        "בסוף המדריך הזה התנועות והיתרות של חשבון אחד יופיעו ב-Penny ויתעדכנו לבד פעם ביום. זה לוקח כמה דקות, ואפשר לעצור בכל שלב ולייבא קובץ במקום.",
      sections: [
        {
          h: "מתקינים ופותחים את Penny",
          p: `אם עוד לא התקנתם, מתחילים ב<a href="install.html">דף ההתקנה</a>. בפתיחה הראשונה היכרות קצרה מלווה אתכם, ואחד השלבים שלה הוא <b>איך הנתונים יגיעו?</b>`,
        },
        {
          h: "מכינים את החשבון בבנק",
          p: "הסנכרון האוטומטי נכנס לאתר הבנק עם שם המשתמש והסיסמה שלכם, ולכן צריך שהכניסה לאתר תעבוד בלי אימות דו-שלבי.",
          list: [
            "מכבים אימות דו-שלבי בכניסה לאתר הבנק או חברת האשראי",
            "וואן זירו הוא היוצא מהכלל: הוא שולח קוד SMS חד-פעמי בסנכרון הראשון",
            "מוודאים ש-Chrome או Edge מותקן במחשב. הסנכרון משתמש בו",
          ],
        },
        {
          h: "בוחרים בנק או חברת אשראי",
          p: "בהיכרות בוחרים <b>חיבור אוטומטי לבנק או לכרטיס</b>. אחרי ההיכרות מגיעים לאותו מקום דרך <b>הגדרות ← חשבונות וייבוא</b>, בשורה <b>אוטומטי: חיבור לבנק או לכרטיס</b>. בוחרים את הבנק מהרשימה וקוראים את <b>לפני שמתחברים</b>.",
          shot: "demo/accounts",
          alt: "עמוד כל החשבונות: השווי הנקי, החשבונות ורשימת חיבורי הבנקים",
        },
        {
          h: "מזינים את פרטי הכניסה",
          p: "מקלידים את אותם פרטים שמשמשים אתכם באתר הבנק ולוחצים <b>חיבור</b>. הפרטים נשמרים מוצפנים במחשב הזה בלבד, ולא נשלחים לשום שרת חיצוני.",
        },
        {
          h: "מריצים סנכרון ראשון",
          p: "בסנכרון רואים את ההתקדמות של כל חשבון. אם הבנק שולח קוד, מופיעה שורה <b>הזינו את הקוד החד-פעמי שנשלח אליכם</b>: מקלידים את הקוד ולוחצים <b>שליחה</b>. בסיום כתוב <b>הסנכרון הושלם</b>, עם מספר התנועות החדשות.",
        },
        {
          h: "נותנים לזה לרוץ כל יום",
          p: "מעכשיו התנועות מתעדכנות לבד פעם ביום, כשהמחשב דולק. כשרוצים עדכון מיידי לוחצים <b>סנכרון הכול</b> בעמוד <b>חשבונות וייבוא</b>.",
        },
        {
          h: "אם החיבור לא עובד, מייבאים קובץ",
          p: `בנק יכול לשנות את האתר שלו ולשבור חיבור עד שמתקנים. בינתיים מורידים מאתר הבנק קובץ Excel או CSV ומייבאים אותו, והנתונים לא הולכים לאיבוד. <a href="feature-import-files.html">כך עובד הייבוא</a>.`,
        },
      ],
      know: [
        "סנכרון הבנקים בבטא, והוא אינו שירות רשמי של הבנק. משיכת נתונים אוטומטית מאתר הבנק עלולה להפר את תנאי השימוש שלו.",
        "לבנק ששולח קוד חד-פעמי בסנכרון הראשון נשמר אסימון אימות, כך שבסנכרונים הבאים לא צריך קוד חדש.",
        "אם הבנק מציע בנקאות פתוחה, אפשר לבחור בה בצורת החיבור: בלי סיסמה לבנק, עם אישור מחדש אחת לתקופה.",
      ],
      faq: [
        [
          "איפה נשמרת הסיסמה לבנק?",
          `מוצפנת, במחשב שלכם בלבד. היא נשלחת רק לאתר הבנק עצמו בזמן הסנכרון. <a href="feature-privacy-security.html">עוד על פרטיות ואבטחה</a>.`,
        ],
        [
          "הבנק שלי לא מופיע ברשימה. מה עושים?",
          "מייבאים את קובצי התנועות שלו. כל קובץ עם עמודות תאריך, תיאור וסכום מתאים.",
        ],
        [
          "חייבים לחבר סיסמה כדי להשתמש ב-Penny?",
          "לא. ייבוא קובץ עובד בלי סיסמאות ובלי גישה לחשבון, ואפשר לשלב בין השניים.",
        ],
      ],
    },
    en: {
      title: "Connect your first bank",
      h1: "How to connect your first bank and see your transactions.",
      desc: "From install to a first automatic sync: picking a bank or card company, entering your sign-in details, the one-time code, and daily sync. And what to do when a connection doesn't work.",
      intro:
        "By the end of this guide, one account's transactions and balances will show in Penny and refresh on their own once a day. It takes a few minutes, and at any step you can stop and import a file instead.",
      sections: [
        {
          h: "Install and open Penny",
          p: `If you haven't installed it yet, start on the <a href="install.html">install page</a>. On first open a short onboarding walks you through, and one of its steps is <b>How should your data arrive?</b>`,
        },
        {
          h: "Get the bank account ready",
          p: "Automatic sync signs in to the bank's website with your username and password, so signing in there has to work without two-factor authentication.",
          list: [
            "Turn off two-factor sign-in on the bank's or card company's website",
            "One Zero is the exception: it sends a one-time SMS code on the first sync",
            "Make sure Chrome or Edge is installed. Sync uses it",
          ],
        },
        {
          h: "Pick a bank or card company",
          p: "In onboarding choose <b>Connect a bank or card automatically</b>. After onboarding the same place is under <b>Settings → Accounts & import</b>, in the row <b>Automatic: connect a bank or card</b>. Pick your bank from the list and read <b>Before you connect</b>.",
          shot: "demo/accounts",
          alt: "The all-accounts page: net worth, the accounts and the list of bank connections",
        },
        {
          h: "Enter your sign-in details",
          p: "Type the same details you use on the bank's website and press <b>Connect</b>. They are stored encrypted on this computer only, and are not sent to any external server.",
        },
        {
          h: "Run the first sync",
          p: "During a sync you see each account's progress. If the bank sends a code, a row says <b>Enter the one-time code we just sent you</b>: type the code and press <b>Submit</b>. When it finishes it says <b>Sync complete</b>, with the number of new transactions.",
        },
        {
          h: "Let it run every day",
          p: "From now on transactions update on their own once a day, while the computer is on. For an update right now, press <b>Sync all</b> on the <b>Accounts & import</b> page.",
        },
        {
          h: "If the connection doesn't work, import a file",
          p: `A bank can change its website and break a connection until it is fixed. Meanwhile download an Excel or CSV file from the bank's site and import it, and no data is lost. <a href="feature-import-files.html">How importing works</a>.`,
        },
      ],
      know: [
        "Bank sync is in beta and is not an official bank service. Pulling data automatically from a bank's site may violate its terms of service.",
        "For a bank that sends a one-time code on the first sync, a long-term token is saved, so later syncs don't need a fresh code.",
        "If your bank offers open banking, you can pick it as the way to connect: no bank password, with re-approval every so often.",
      ],
      faq: [
        [
          "Where is my bank password stored?",
          `Encrypted, on your computer only. It is sent only to the bank's own site during a sync. <a href="feature-privacy-security.html">More on privacy and security</a>.`,
        ],
        [
          "My bank isn't in the list. What now?",
          "Import its statement files. Any file with date, description and amount columns works.",
        ],
        [
          "Do I have to connect a password to use Penny?",
          "No. Importing a file works with no passwords and no access to the account, and you can mix the two.",
        ],
      ],
    },
  },
  {
    slug: "move-from-excel-or-another-app",
    related: ["import", "transactions", "budgets"],
    he: {
      title: "מעבר מ-Excel או מאפליקציה אחרת",
      h1: "איך עוברים מ-Excel או מאפליקציה אחרת בלי לאבד היסטוריה.",
      desc: "מייצאים את התנועות לקובץ, מייבאים אותו או מדביקים את הטבלה לגיליון החכם, משייכים עמודות, נותנים ל-Penny לזהות כפילויות ולהציע קטגוריות, ושומרים. אפשר לבטל.",
      intro:
        "ההיסטוריה שלכם לא צריכה להישאר מאחור. כל טבלה עם תאריך, תיאור וסכום יכולה להיכנס ל-Penny, מקובץ או בהדבקה, ואפשר לבדוק כל שורה לפני השמירה.",
      sections: [
        {
          h: "מייצאים את התנועות מהמקום הישן",
          p: "מהאפליקציה הקודמת מייצאים קובץ CSV או Excel. גיליון Excel שלכם אפשר להשאיר כמו שהוא. מה שחשוב הוא שיהיו בו עמודות תאריך, תיאור וסכום, או חובה וזכות.",
          list: [
            "CSV ו-xlsx נקראים ישר",
            "קובץ xls בינארי ישן: שומרים אותו מחדש כ-xlsx או כ-CSV",
            "תאריכים בצורת יום/חודש/שנה, שנה-חודש-יום, או תאריך של Excel",
          ],
        },
        {
          h: "דרך א׳: מייבאים קובץ",
          p: "ב<b>הגדרות ← חשבונות וייבוא</b> בוחרים <b>ידני: ייבוא קובץ</b>, בוחרים את המוסד או <b>מוסד אחר / ללא מוסד</b>, ואז <b>בחירת קובץ</b>. לפני השמירה מופיעה תצוגה מקדימה של עשר השורות הראשונות, ואפשר לתקן בה את העמודות.",
        },
        {
          h: "דרך ב׳: מדביקים לגיליון החכם",
          p: "ב<b>ייבוא חכם בגיליון</b> מעתיקים טבלה שלמה מ-Excel או מ-Google Sheets, מדביקים כמו שהיא ולוחצים <b>טעינת השורות</b>. כל תא ניתן לתיקון בגיליון עצמו.",
          list: [
            "שורת כותרת מזוהה לבד. בלי כותרת נפתח <b>שיוך עמודות</b>",
            "בוחרים <b>חשבון ברירת מחדל</b> ו<b>סדר תאריכים</b>",
            "קובעים אם סכום חיובי הוא הוצאה או הכנסה",
          ],
        },
        {
          h: "בודקים כפילויות",
          p: "תנועה שכבר שמורה באותו חשבון מסומנת <b>כבר קיימת</b> ומדולגת, כך שאפשר לייבא קבצים חופפים בלי חשש. אם זו באמת תנועה נפרדת, אפשר לכלול אותה בכל זאת.",
        },
        {
          h: "נותנים קטגוריות",
          p: "בגיליון החכם לוחצים <b>הצעת קטגוריות</b>, וההצעות מגיעות מבתי עסק שכבר לימדתם. מאשרים את כולן או בוחרים קטגוריה ידנית בכל שורה.",
        },
        {
          h: "שומרים, ואם צריך מבטלים",
          p: "לוחצים על כפתור השמירה, שמראה כמה תנועות ייכנסו. בסיום כתוב כמה נשמרו וכמה כפילויות דולגו. מיד אחרי השמירה אפשר ללחוץ <b>ביטול</b> ולבטל את כל הייבוא.",
          shot: "demo/transactions",
          alt: "עמוד התנועות: רשימה מקובצת לפי שבוע, עם קטגוריה, חשבון ובעלים לכל תנועה",
        },
      ],
      know: [
        "יש תקרה למספר השורות בייבוא אחד. קובץ גדול מאוד כדאי לפצל לפי תקופה.",
        "שורות על חשבון המזומן נשמרות כתנועות ידניות שאפשר לערוך תמיד. שורות על חשבון אמיתי נשמרות כמו ייבוא מקובץ, כך שהסנכרון הבא לא ישכפל אותן.",
        "הקובץ נקרא רק במחשב הזה ולא נשלח לשום מקום.",
      ],
      faq: [
        [
          "אפשר לייבא PDF?",
          "ייבוא הקובץ הרגיל לא קורא PDF. בגיליון החכם יש קריאה עם AI לדף חשבון, קבלה או טקסט חופשי, והיא דורשת ספק AI מחובר. הטקסט נשלח רק לספק שבחרתם.",
        ],
        [
          "מה קורה אם ייבאתי משהו שגוי?",
          "מיד אחרי השמירה אפשר לבטל את כל הייבוא בלחיצה אחת, ולנסות שוב.",
        ],
        [
          "אחרי שעברתי, צריך להמשיך לייבא ידנית?",
          `לא חייבים. אפשר לחבר את הבנק לסנכרון אוטומטי, והתנועות החדשות יגיעו לבד בלי לשכפל את מה שייבאתם. <a href="guide-connect-your-first-bank.html">איך מחברים בנק</a>.`,
        ],
      ],
    },
    en: {
      title: "Move from Excel or another app",
      h1: "How to move from Excel or another app without losing your history.",
      desc: "Export your transactions to a file, import it or paste the table into the smart sheet, map the columns, let Penny spot duplicates and suggest categories, and save. You can undo.",
      intro:
        "Your history doesn't have to stay behind. Any table with a date, a description and an amount can come into Penny, from a file or by pasting, and you can check every row before saving.",
      sections: [
        {
          h: "Export your transactions from the old place",
          p: "From your previous app, export a CSV or Excel file. Your own Excel sheet can stay as it is. What matters is that it has date, description and amount columns, or debit and credit.",
          list: [
            "CSV and xlsx are read directly",
            "An old binary xls file: re-save it as xlsx or CSV",
            "Dates as day/month/year, year-month-day, or an Excel date",
          ],
        },
        {
          h: "Option A: import a file",
          p: "Under <b>Settings → Accounts & import</b> choose <b>Manual: import a file</b>, pick the institution or <b>Another institution / none</b>, then <b>Choose a file</b>. Before saving you get a preview of the first ten rows, where you can fix the columns.",
        },
        {
          h: "Option B: paste into the smart sheet",
          p: "In <b>Smart sheet import</b>, copy a whole table from Excel or Google Sheets, paste it as it is and press <b>Load rows</b>. Every cell can be fixed in the sheet itself.",
          list: [
            "A header row is detected on its own. Without one, <b>Column mapping</b> opens",
            "Choose a <b>Default account</b> and the <b>Date order</b>",
            "Set whether a positive amount is an expense or income",
          ],
        },
        {
          h: "Check the duplicates",
          p: "A transaction already saved on the same account is marked <b>Already saved</b> and skipped, so overlapping files are safe. If it really is a separate transaction, you can include it anyway.",
        },
        {
          h: "Give them categories",
          p: "In the smart sheet press <b>Suggest categories</b>, and suggestions come from merchants you've already taught. Accept them all, or pick a category by hand on any row.",
        },
        {
          h: "Save, and undo if you need to",
          p: "Press the save button, which shows how many transactions will go in. When it's done it tells you how many were saved and how many duplicates were skipped. Right after saving you can press <b>Undo</b> and take back the whole import.",
          shot: "demo/transactions",
          alt: "The transactions page: a list grouped by week, each row with its category, account and owner",
        },
      ],
      know: [
        "There is a cap on rows per import. Split a very large file by period.",
        "Rows on the cash wallet stay manual rows you can always edit. Rows on a real account are saved like a file import, so the next sync won't duplicate them.",
        "The file is read only on this computer and is sent nowhere.",
      ],
      faq: [
        [
          "Can I import a PDF?",
          "The regular file import doesn't read PDFs. The smart sheet can read a statement, a receipt or free text with AI, which needs a connected AI provider. The text goes only to the provider you chose.",
        ],
        [
          "What if I imported something wrong?",
          "Right after saving you can undo the whole import in one click, and try again.",
        ],
        [
          "After moving over, do I have to keep importing by hand?",
          `You don't have to. Connect your bank for automatic sync, and new transactions arrive on their own without duplicating what you imported. <a href="guide-connect-your-first-bank.html">How to connect a bank</a>.`,
        ],
      ],
    },
  },
  {
    slug: "monthly-family-budget",
    related: ["budgets", "forecasts", "telegram"],
    he: {
      title: "תקציב חודשי למשפחה",
      h1: "איך בונים תקציב חודשי למשפחה, ונשארים בו.",
      desc: "בונים תקציב מהממוצע שלכם בלחיצה, עוקבים אחרי קצב ההוצאה, בודקים שכל שקל קיבל תפקיד, מוסיפים מעקב לתקופה, ומסכמים את החודש.",
      intro:
        "תקציב טוב מתחיל ממה שאתם באמת מוציאים, לא ממה שהייתם רוצים להוציא. Penny בונה אותו מההיסטוריה שלכם, ואז מראה במהלך החודש אם אתם בקצב.",
      sections: [
        {
          h: "מוודאים שיש היסטוריה",
          p: `ההצעות לתקציב מחושבות מההוצאה הממוצעת בשלושת החודשים המלאים האחרונים, והן מופיעות אחרי חודש מלא אחד לפחות. אם התחלתם עכשיו, <a href="guide-move-from-excel-or-another-app.html">מייבאים כמה חודשים אחורה</a>.`,
        },
        {
          h: "בונים תקציב מהממוצע",
          p: "בעמוד <b>תקציב</b> לוחצים <b>לבנות תקציב מהממוצע שלך</b>. לכל קטגוריה מוצע סכום, מעוגל כלפי מעלה, ליד הממוצע שלה. משנים כל סכום שרוצים ולוחצים <b>שמירה</b>.",
          shot: "demo/budget",
          alt: "עמוד התקציב: כמה נשאר החודש, הכפתור לבניית תקציב מהממוצע, וטבלת הקטגוריות",
        },
        {
          h: "קובעים מסגרת חודשית",
          p: "בהגדרות הכלליות מגדירים את סכום ההוצאות המתוכנן לחודש. הוא משמש להשוואת קצב ההוצאות בעמוד התקציב. בלי מסגרת, ההשוואה לא מוצגת.",
        },
        {
          h: "קוראים את הקצב",
          p: "בכרטיס <b>קצב ההוצאה</b> מופיעים שני מספרים: כמה הוצא מהתקציב, וכמה עבר מהחודש. כשהראשון גדול מהשני, אתם מוציאים מהר מדי. לכל קטגוריה יש פס משלה, וחריגות מסומנות.",
        },
        {
          h: "בודקים שכל שקל קיבל תפקיד",
          p: "הכרטיס <b>כל שקל בתפקיד</b> משווה את הכנסות החודש למה ששובץ לתקציבים. אם נשארה הכנסה בלי תפקיד, מגדילים תקציב, חיסכון או יעד. אם התקציבים מבטיחים יותר ממה שנכנס, מקטינים אחד מהם.",
          list: ["בתצוגת 50/30/20 רואים את החלוקה בין צרכים, רצונות וחיסכון"],
        },
        {
          h: "מוסיפים מעקב לדבר אחד",
          p: "ב<b>מעקבים</b> לוחצים <b>מעקב חדש</b> ונותנים לו שם, תאריכי התחלה וסיום, תקרה בשקלים וקטגוריות. למשל מסעדות עד סוף החודש, חופשה או שיפוץ.",
        },
        {
          h: "מסכמים את החודש",
          p: `ב<b>סיכום תקופה</b> רואים את החודש בכמה כרטיסים: כמה נשאר בצד וכמה יצא לעומת החודש הקודם. מי שחיבר את <a href="feature-telegram-bot.html">בוט הטלגרם</a> מקבל גם אחרי כל סנכרון את ההוצאות החדשות, וכמה נשאר בתקציב של כל אחת.`,
          shot: "assets/shots/recap",
          alt: "סיכום תקופה: כמה נשאר בצד החודש וכמה יצא לעומת החודש הקודם",
        },
      ],
      know: [
        "כל הפרופילים חולקים משק בית אחד משותף, ולכל אחד סידור המסך שלו.",
        "התקציב נבנה מהתנועות שבאפליקציה, ולא משנה אם הגיעו מסנכרון, מקובץ או מהוספה ידנית.",
        "הוצאה גדולה שידועה מראש (טיול, מכשיר, תיקון) כדאי לרשום כהוצאה מתוכננת, כדי שתיכנס לתחזית.",
      ],
      faq: [
        [
          "אין לי עדיין היסטוריה. אפשר להתחיל?",
          "כן. אפשר להקליד תקציב לכל קטגוריה ידנית. ההצעות מהממוצע יופיעו אחרי חודש מלא אחד.",
        ],
        [
          "אפשר לבטל תקציב שנבנה מהממוצע?",
          "כן. אחרי השמירה יש <b>ביטול</b>, וכל סכום אפשר לשנות אחר כך.",
        ],
        [
          "איך יודעים שחורגים לפני סוף החודש?",
          `לפי הקצב: משווים את מה שהוצא מהתקציב לחלק של החודש שכבר עבר. <a href="feature-budgeting.html">עוד על התקציב</a>.`,
        ],
      ],
    },
    en: {
      title: "A monthly family budget",
      h1: "How to build a monthly family budget, and stay in it.",
      desc: "Build a budget from your own average in one click, follow your spending pace, check that every shekel has a job, add a tracker for a period, and recap the month.",
      intro:
        "A good budget starts from what you really spend, not what you wish you spent. Penny builds it from your history, then shows through the month whether you're on pace.",
      sections: [
        {
          h: "Make sure there is history",
          p: `Budget suggestions are worked out from your average spend over the last three full months, and they appear after at least one full month. If you've only just started, <a href="guide-move-from-excel-or-another-app.html">import a few months back</a>.`,
        },
        {
          h: "Build a budget from your average",
          p: "On the <b>Budget</b> page press <b>Build a budget from your average</b>. Each category gets a suggested amount, rounded up, next to its average. Change any amount you like and press <b>Save</b>.",
          shot: "demo/budget",
          alt: "The budget page: what is left this month, the button to build a budget from your average, and the category table",
        },
        {
          h: "Set a monthly target",
          p: "In the General settings, set your planned spending for the month. The Budget page uses it to compare your spending pace. Without a target, the comparison is hidden.",
        },
        {
          h: "Read the pace",
          p: "The <b>Spending pace</b> card shows two numbers: how much of the budget is spent, and how much of the month has passed. When the first is larger than the second, you're spending too fast. Each category has its own bar, and overspending is flagged.",
        },
        {
          h: "Check that every shekel has a job",
          p: "The <b>Every shekel a job</b> card compares this month's income with what is assigned to budgets. If income is left with no job, raise a budget, savings or a goal. If budgets promise more than came in, lower one of them.",
          list: ["The 50/30/20 view shows the split between needs, wants and savings"],
        },
        {
          h: "Add a tracker for one thing",
          p: "Under <b>Trackers</b> press <b>New tracker</b> and give it a name, from and to dates, a limit in shekels and categories. Eating out until month end, say, or a holiday or a renovation.",
        },
        {
          h: "Recap the month",
          p: `The <b>Period recap</b> shows the month in a few cards: how much was set aside, and how spending compares with the month before. If you've connected the <a href="feature-telegram-bot.html">Telegram bot</a>, you also get the new expenses after every sync, with what is left in each one's budget.`,
          shot: "assets/shots/recap",
          alt: "Period recap: how much was set aside this month, and spending against the month before",
        },
      ],
      know: [
        "All profiles share one household, and each person keeps their own screen layout.",
        "The budget is built from the transactions in the app, whether they came from sync, a file or manual entry.",
        "A large expense you know is coming (a trip, a device, a repair) is worth writing down as a planned expense, so it joins the forecast.",
      ],
      faq: [
        [
          "I have no history yet. Can I start?",
          "Yes. You can type a budget for each category by hand. Suggestions from your average appear after one full month.",
        ],
        [
          "Can I undo a budget built from my average?",
          "Yes. After saving there is an <b>Undo</b>, and any amount can be changed later.",
        ],
        [
          "How do I know I'm overspending before the month ends?",
          `By the pace: compare what is spent of the budget with the part of the month that has passed. <a href="feature-budgeting.html">More on budgeting</a>.`,
        ],
      ],
    },
  },
  {
    slug: "import-your-pension-report",
    related: ["pension", "table", "insurance"],
    he: {
      title: "ייבוא דוח הפנסיה",
      h1: "איך מייבאים את דוח הפנסיה מהסוכן ובודקים את דמי הניהול.",
      desc: "ממירים את הדוח התקופתי של הסוכן לקובץ JSON, מייבאים אותו, ורואים כל מוצר בנכסים, כל פוליסה בביטוחים, ואת דמי הניהול שלכם מול השוק.",
      intro:
        "הדוח התקופתי שהסוכן או היועץ שולח מכיל את כל החיסכון לטווח ארוך במקום אחד. ייבוא אחד מכניס אותו ל-Penny, ומשם רואים מה שווה כל מוצר וכמה אתם משלמים עליו.",
      sections: [
        {
          h: "משיגים את הדוח התקופתי",
          p: "מבקשים מסוכן הביטוח או מהיועץ את הדוח התקופתי: פנסיה, קרן השתלמות, קופת גמל והביטוחים שבהם. זה לא דוח המסלקה הפנסיונית, ש-Penny עדיין לא קוראת.",
        },
        {
          h: "ממירים אותו ל-JSON",
          p: `Penny לא קוראת את קובץ ה-PDF עצמו. צריך להוציא ממנו את הנתונים לקובץ JSON במבנה של קובץ הדוגמה. כל כלי שמפיק את המבנה הזה מתאים. <a href="${DOCS}/pension-report.md">המבנה המלא</a>.`,
          list: [
            "תאריך הדוח, בצורה YYYY-MM-DD",
            "סך החיסכון, מתוך הסיכום של הדוח עצמו",
            "לכל מוצר: סוג, שם, חברה ויתרה",
            "אם רוצים: דמי ניהול, הפקדה חודשית והביטוחים שבדוח",
          ],
        },
        {
          h: "מייבאים את הקובץ",
          p: "ב<b>הגדרות ← חשבונות וייבוא</b>, בקבוצה <b>פנסיה, השתלמות ובתי השקעות</b>, מוצאים את <b>ייבוא דוח פנסיה</b>. יש שם קישור ל<b>קובץ דוגמה</b>. לוחצים <b>בחירת קובץ JSON</b> ובוחרים את הקובץ.",
        },
        {
          h: "בודקים מה נכנס",
          p: "בסיום כתוב כמה מוצרים וכמה פוליסות יובאו. כל מוצר נכנס לנכסים עם השווי שלו בתאריך הדוח, דמי הניהול וההפקדה החודשית. כל פוליסה נכנסת לביטוחים, עם פרמיה חודשית.",
          shot: "demo/accounts",
          alt: "רשימת החשבונות: פנסיה, קרן השתלמות ותיק השקעות תחת השקעות וחיסכון",
        },
        {
          h: "בודקים את דמי הניהול מול השוק",
          p: "ב<b>כסף על השולחן</b> מופיעים דמי ניהול שגבוהים מהמקובל בשוק, עם הסכום השנתי והצעד הבא. אחרי שטיפלתם, לוחצים <b>עשיתי</b>, והחיסכון נספר.",
          shot: "demo/savings",
          alt: "כסף על השולחן: דמי ניהול גבוהים בפנסיה ובקרן ההשתלמות, עם סכום שנתי לכל אחד",
        },
        {
          h: "מרעננים כשמגיע דוח חדש",
          p: "מייבאים את הדוח החדש באותה דרך. מוצר שכבר קיים מתעדכן ולא משוכפל, ומה ששיניתם בעצמכם, כמו שם הנכס או ההערות על פוליסה, נשמר.",
        },
      ],
      know: [
        "הייבוא נבדק מול הסיכום של הדוח עצמו: אם סכום המוצרים לא מתאים לסך החיסכון, הקובץ נדחה ושום דבר לא נכנס.",
        "קריאה אוטומטית של דוח המסלקה הפנסיונית עדיין בתוכנית העבודה. בינתיים יש במחשבונים מדריך לקריאת הדוח.",
        "ההשוואה לשוק היא הערכה, לא ייעוץ פנסיוני.",
        "הקובץ נקרא ונשמר על המחשב שלכם, ושום דבר ממנו לא יוצא החוצה.",
      ],
      faq: [
        [
          "הגוף שלי מסתנכרן ישירות. צריך בכל זאת את הדוח?",
          `לא חייבים. מיטב, אלטשולר שחם, הפניקס, אקסלנס טרייד, הראל, מגדל, כלל ומנורה מתחברים ישירות ומעדכנים את היתרות. הדוח מוסיף דמי ניהול, הפקדות וביטוחים. <a href="feature-pension-savings.html">עוד על פנסיה וחיסכון</a>.`,
        ],
        [
          "הייבוא נכשל. מה בודקים?",
          "שהקובץ הוא JSON תקין, שהוא מתאים לקובץ הדוגמה, ושסכום היתרות של המוצרים שווה לסך החיסכון שבסיכום.",
        ],
        [
          "מה קורה אם אייבא את אותו דוח פעמיים?",
          "הוא מתעדכן ולא משוכפל. אותו דוח מזוהה לפי התאריך, שם העמית והמקור.",
        ],
      ],
    },
    en: {
      title: "Import your pension report",
      h1: "How to import your agent's pension report and check your fees.",
      desc: "Turn your agent's periodic report into a JSON file, import it, and see each product in assets, each policy in insurance, and your management fees against the market.",
      intro:
        "The periodic report your agent or advisor sends holds all your long-term savings in one place. One import brings it into Penny, and from there you see what each product is worth and what you pay for it.",
      sections: [
        {
          h: "Get the periodic report",
          p: "Ask your insurance agent or advisor for the periodic report: pension, study fund, provident fund and the insurance in them. This is not the pension clearing-house report, which Penny doesn't read yet.",
        },
        {
          h: "Turn it into JSON",
          p: `Penny doesn't read the PDF itself. The data has to be extracted into a JSON file shaped like the example file. Any tool that produces that shape works. <a href="${DOCS}/pension-report.md">The full format</a>.`,
          list: [
            "The report date, as YYYY-MM-DD",
            "Total savings, from the report's own summary",
            "For each product: type, name, provider and balance",
            "Optionally: management fees, the monthly deposit and the insurance in the report",
          ],
        },
        {
          h: "Import the file",
          p: "Under <b>Settings → Accounts & import</b>, in the group <b>Pension, study funds and investment houses</b>, find <b>Import a pension report</b>. There is a link to an <b>Example file</b> there. Press <b>Choose a JSON file</b> and pick your file.",
        },
        {
          h: "Check what came in",
          p: "When it finishes it tells you how many products and policies were imported. Each product lands in assets with its value on the report date, its management fees and its monthly deposit. Each policy lands in insurance, with a monthly premium.",
          shot: "demo/accounts",
          alt: "The accounts list: a pension, a study fund and an investment portfolio under investments and savings",
        },
        {
          h: "Check your fees against the market",
          p: "<b>Money on the table</b> lists management fees that are above what is usual in the market, with the yearly amount and the next step. Once you've dealt with one, press <b>Done it</b> and the saving counts.",
          shot: "demo/savings",
          alt: "Money on the table: high fees on a pension and a study fund, each with a yearly amount",
        },
        {
          h: "Refresh when a new report arrives",
          p: "Import the new report the same way. A product that already exists is updated, not duplicated, and what you changed yourself, such as an asset's name or the notes on a policy, is kept.",
        },
      ],
      know: [
        "The import is checked against the report's own summary: if the products don't add up to the total savings, the file is refused and nothing is imported.",
        "Reading the pension clearing-house report automatically is still on the roadmap. For now the calculators include a guide to reading it.",
        "The comparison with the market is an estimate, not pension advice.",
        "The file is read and stored on your computer, and none of it leaves.",
      ],
      faq: [
        [
          "My provider syncs directly. Do I still need the report?",
          `You don't have to. Meitav, Altshuler Shaham, Phoenix, Excellence Trade, Harel, Migdal, Clal and Menora connect directly and update your balances. The report adds fees, deposits and insurance. <a href="feature-pension-savings.html">More on pension and savings</a>.`,
        ],
        [
          "The import failed. What do I check?",
          "That the file is valid JSON, that it matches the example file, and that the products' balances add up to the total savings in the summary.",
        ],
        [
          "What if I import the same report twice?",
          "It is updated, not duplicated. The same report is recognised by its date, member and source.",
        ],
      ],
    },
  },
  {
    slug: "backup-and-move-computers",
    related: ["privacy", "anywhere", "household"],
    he: {
      title: "גיבוי ומעבר למחשב חדש",
      h1: "איך מגבים את Penny ועוברים למחשב חדש.",
      desc: "יוצרים קובץ גיבוי מוצפן, מפעילים גיבוי אוטומטי לתיקייה שהענן שלכם מסנכרן, ומשחזרים הכול במחשב חדש, כולל הגישה לחשבונות הבנק.",
      intro:
        "כל הנתונים שלכם נמצאים על מחשב אחד, אז הגיבוי הוא באחריותכם. קובץ גיבוי אחד מכיל הכול, נפתח רק עם הסיסמה שלכם, ומספיק כדי לשחזר במחשב אחר.",
      sections: [
        {
          h: "יוצרים קובץ גיבוי מוצפן",
          p: "ב<b>הגדרות ← ייבוא וייצוא</b> מוצאים את <b>גיבוי ושחזור מלא</b>. מקלידים <b>סיסמה לקובץ הגיבוי</b>, לפחות 8 תווים, ולוחצים <b>הורדת קובץ גיבוי</b>. הקובץ מכיל את מסד הנתונים ואת מפתח ההצפנה של פרטי הבנק.",
        },
        {
          h: "שומרים את הסיסמה במקום בטוח",
          p: "בלי הסיסמה אין דרך לפתוח את הקובץ, גם לא אצלנו. שומרים אותה במנהל סיסמאות או במקום אחר שלא תלוי במחשב הזה.",
        },
        {
          h: "מפעילים גיבוי אוטומטי",
          p: "באותו עמוד, ב<b>גיבוי אוטומטי לענן</b>, עותק מוצפן של כל הנתונים נשמר לבד בתיקייה שתבחרו.",
          list: [
            "קודם שומרים <b>סיסמת גיבוי</b>",
            "ב<b>תיקיית הגיבוי</b> מקלידים נתיב מלא לתיקייה ש-Google Drive, ‏OneDrive, ‏Dropbox או iCloud מסנכרנים",
            "מפעילים את <b>גיבוי אוטומטי</b>",
            "נשמרים 7 הגיבויים האחרונים, והישנים נמחקים",
          ],
        },
        {
          h: "מתקינים את Penny במחשב החדש",
          p: `מתקינים כרגיל לפי <a href="install.html">דף ההתקנה</a>, ומביאים את קובץ הגיבוי האחרון, מהתיקייה שבענן או על דיסק נייד.`,
        },
        {
          h: "משחזרים מהגיבוי",
          p: "ב<b>גיבוי ושחזור מלא</b>, תחת <b>שחזור מגיבוי</b>, לוחצים <b>בחירת קובץ גיבוי</b>, מקלידים את הסיסמה, מסמנים <b>אני מבין שהנתונים הנוכחיים יוחלפו</b> ולוחצים <b>שחזור</b>. בסיום כתוב כמה תנועות שוחזרו.",
          list: [
            "אם נעילת האפליקציה פעילה, מכבים אותה ב<b>פרטיות ואבטחה</b>, משחזרים, ומפעילים אותה מחדש",
          ],
        },
        {
          h: "בודקים שהכול חזר",
          p: "מריצים סנכרון כדי לוודא שהחיבורים לבנקים עובדים, ומגדירים במחשב החדש את תיקיית הגיבוי האוטומטי, כי הנתיב שלה יכול להיות שונה.",
        },
      ],
      know: [
        "השחזור מחליף את כל הנתונים הקיימים. לפני כן נשמר עותק שלהם בתיקיית backups, וצריך לאשר במפורש.",
        "הגיבוי האוטומטי לא רץ כשהאפליקציה נעולה. הוא מתבצע אחרי שפותחים אותה.",
        "ייצוא ה-CSV של התנועות אינו מוצפן: מי שמקבל את הקובץ יכול לקרוא הכול. לשמירת עותק משתמשים בגיבוי המוצפן.",
        `בהתקנה מקוד המקור אפשר גם להעתיק את תיקיית data למחשב החדש. <a href="${DOCS}/install.md">הפרטים במדריך ההתקנה</a>.`,
      ],
      faq: [
        [
          "שכחתי את סיסמת הגיבוי. אפשר לשחזר?",
          "לא. בלי הסיסמה הקובץ לא נפתח. אם הנתונים עדיין במחשב הישן, יוצרים שם גיבוי חדש עם סיסמה חדשה.",
        ],
        [
          "הגיבוי כולל את הסיסמאות לבנק?",
          "הוא כולל את מפתח ההצפנה של פרטי הבנק, כך שאחרי שחזור החיבורים עובדים בלי להקליד אותם מחדש. לכן חשוב שהקובץ מוצפן בסיסמה חזקה.",
        ],
        [
          "זה בטוח לשים את הגיבוי בענן?",
          `הקובץ מוצפן ונפתח רק עם סיסמת הגיבוי, כך שספק הענן לא יכול לקרוא אותו. <a href="feature-privacy-security.html">עוד על פרטיות ואבטחה</a>.`,
        ],
      ],
    },
    en: {
      title: "Back up and move computers",
      h1: "How to back up Penny and move to a new computer.",
      desc: "Create an encrypted backup file, turn on automatic backup to a folder your cloud syncs, and restore everything on a new computer, including access to your bank accounts.",
      intro:
        "All your data lives on one computer, so backing it up is up to you. One backup file holds everything, opens only with your passphrase, and is all you need to restore on another machine.",
      sections: [
        {
          h: "Create an encrypted backup file",
          p: "Under <b>Settings → Import/Export</b> find <b>Full backup and restore</b>. Type a <b>Backup passphrase</b> of at least 8 characters and press <b>Download backup</b>. The file holds the database and the key that decrypts your stored bank credentials.",
        },
        {
          h: "Keep the passphrase somewhere safe",
          p: "Without the passphrase the file cannot be opened, by us either. Keep it in a password manager or somewhere else that doesn't depend on this computer.",
        },
        {
          h: "Turn on automatic backup",
          p: "On the same page, under <b>Automatic cloud backup</b>, an encrypted copy of all your data is saved by itself into a folder you choose.",
          list: [
            "First save a <b>Backup passphrase</b>",
            "In <b>Backup folder</b>, type the full path of a folder that Google Drive, OneDrive, Dropbox or iCloud syncs",
            "Turn on <b>Automatic backup</b>",
            "The newest 7 backups are kept, and older ones are deleted",
          ],
        },
        {
          h: "Install Penny on the new computer",
          p: `Install as usual from the <a href="install.html">install page</a>, and bring the latest backup file, from the cloud folder or on a portable drive.`,
        },
        {
          h: "Restore from the backup",
          p: "In <b>Full backup and restore</b>, under <b>Restore from a backup</b>, press <b>Choose a backup file</b>, type the passphrase, tick <b>I understand the current data will be replaced</b> and press <b>Restore</b>. When it finishes it tells you how many transactions were restored.",
          list: [
            "If the app lock is on, turn it off under <b>Privacy & security</b>, restore, then turn it on again",
          ],
        },
        {
          h: "Check that everything is back",
          p: "Run a sync to make sure the bank connections work, and set the automatic backup folder on the new computer, because its path may be different.",
        },
      ],
      know: [
        "Restoring replaces all current data. A copy of it is saved in the backups folder first, and you have to confirm explicitly.",
        "Automatic backup doesn't run while the app is locked. It runs once you unlock it.",
        "The CSV export of transactions is not encrypted: anyone who gets the file can read everything. To keep a copy, use the encrypted backup.",
        `On a source install you can also copy the data folder to the new computer. <a href="${DOCS}/install.md">Details in the install guide</a>.`,
      ],
      faq: [
        [
          "I forgot the backup passphrase. Can I restore?",
          "No. Without the passphrase the file does not open. If the data is still on the old computer, create a new backup there with a new passphrase.",
        ],
        [
          "Does the backup include my bank passwords?",
          "It includes the key that decrypts your bank credentials, so after a restore the connections work without typing them again. That is why the file should be protected by a strong passphrase.",
        ],
        [
          "Is it safe to put the backup in the cloud?",
          `The file is encrypted and opens only with the backup passphrase, so the cloud provider can't read it. <a href="feature-privacy-security.html">More on privacy and security</a>.`,
        ],
      ],
    },
  },
  {
    slug: "connect-the-telegram-bot",
    related: ["telegram", "budgets", "privacy"],
    he: {
      title: "חיבור בוט הטלגרם",
      h1: "איך מחברים את בוט הטלגרם ומקבלים עדכונים לטלפון.",
      desc: "יוצרים בוט פרטי בטלגרם, מדביקים את הטוקן ב-Penny, מחברים את הצ׳אט בלחיצה על Start, ומקבלים סיכומים, תזכורות והתראות. אפשר להסתיר סכומים.",
      intro:
        "הבוט הוא שלכם: אתם יוצרים אותו בטלגרם, והוא מדבר רק עם Penny שעל המחשב שלכם ורק עם הצ׳אט שלכם. ההגדרה לוקחת כמה דקות.",
      sections: [
        {
          h: "פותחים את הגדרות הטלגרם",
          p: "ב-Penny נכנסים ל<b>הגדרות ← טלגרם</b>. ההגדרה שם מחולקת לשני שלבים: יוצרים בוט, ואז מחברים את הצ׳אט.",
        },
        {
          h: "יוצרים בוט אצל BotFather",
          p: "זה <b>שלב 1: יוצרים בוט</b>. עושים אותו בטלגרם, בטלפון או במחשב.",
          list: [
            'פותחים בטלגרם את <bdi dir="ltr">@BotFather</bdi> ושולחים <bdi dir="ltr">/newbot</bdi>',
            "בוחרים שם ושם משתמש לבוט",
            "מעתיקים את הטוקן שהוא שולח",
          ],
        },
        {
          h: "מדביקים את הטוקן ב-Penny",
          p: "חוזרים ל-Penny, מדביקים את הטוקן בשדה <b>טוקן הבוט</b> ולוחצים <b>חיבור</b>. הטוקן נשמר מוצפן במחשב הזה בלבד. אם טלגרם לא מאשרת אותו, בודקים שהעתקתם אותו במלואו ושיש חיבור לאינטרנט.",
        },
        {
          h: "מחברים את הצ׳אט",
          p: "ב<b>שלב 2: מחברים את הצ׳אט</b> לוחצים על הכפתור שפותח את הבוט בטלגרם, ושם לוחצים <b>Start</b>. זה מחבר את הצ׳אט שלכם, ורק אותו. ב-Penny מופיע שהבוט מחובר.",
        },
        {
          h: "מבקשים תמונת מצב ראשונה",
          p: 'בבוט יש שני כפתורים: תמונת מצב מצומצמת ותמונת מצב מלאה. אפשר גם לשלוח <bdi dir="ltr">/short</bdi> או <bdi dir="ltr">/full</bdi>. אם קיבלתם תשובה, הכול עובד.',
        },
        {
          h: "מחליטים אם להסתיר סכומים",
          p: "ב<b>הסתרת סכומים בטלגרם</b> מסתירים את הסכומים בהודעות. בהודעות לבחירת קטגוריה עדיין מופיעים שם בית העסק והתאריך.",
        },
        {
          h: "יודעים מה יגיע",
          p: "מעכשיו הבוט שולח לבד:",
          list: [
            "סיכום בימי ראשון, שלישי וחמישי בבוקר",
            "ההוצאות החדשות אחרי כל סנכרון, ומה נשאר בתקציב של כל אחת",
            "תזכורת לפני חיובים קרובים",
            "התראה כשחיבור לבנק מתחיל להיכשל, וכשהוא חוזר",
          ],
        },
      ],
      know: [
        "הבוט פועל כשהמחשב עם Penny דולק, ושותק כשהאפליקציה נעולה.",
        "הסיכומים וההתראות עוברים דרך טלגרם. זה אחד הדברים היחידים שיוצאים מהמחשב, ורק כי חיברתם את הבוט.",
        "כדי להפסיק, לוחצים <b>ניתוק הבוט</b> באותו עמוד בהגדרות.",
      ],
      faq: [
        [
          "למה צריך ליצור בוט משלי?",
          "כי אין שרת של Penny באמצע. הבוט שייך לכם, והטוקן שלו נשמר מוצפן במחשב שלכם בלבד.",
        ],
        [
          "מישהו אחר יכול לדבר עם הבוט שלי?",
          "הבוט מחובר לצ׳אט אחד, זה שלחצתם בו Start מתוך Penny, ועונה רק לו.",
        ],
        [
          "מה עוד אפשר לעשות מהצ׳אט?",
          `לסווג תנועות חדשות, להעביר לבוט הודעת SMS על חיוב בכרטיס כדי לשמור אותה, ולבקש סנכרון. <a href="feature-telegram-bot.html">כל מה שהבוט עושה</a>.`,
        ],
      ],
    },
    en: {
      title: "Connect the Telegram bot",
      h1: "How to connect the Telegram bot and get updates on your phone.",
      desc: "Create a private bot in Telegram, paste its token into Penny, link your chat by pressing Start, and get summaries, reminders and alerts. Amounts can be hidden.",
      intro:
        "The bot is yours: you create it in Telegram, and it talks only to the Penny on your computer and only to your chat. Setting it up takes a few minutes.",
      sections: [
        {
          h: "Open the Telegram settings",
          p: "In Penny go to <b>Settings → Telegram</b>. The setup there has two steps: create a bot, then link your chat.",
        },
        {
          h: "Create a bot with BotFather",
          p: "This is <b>Step 1: Create a bot</b>. You do it in Telegram, on your phone or your computer.",
          list: [
            "In Telegram, open @BotFather and send /newbot",
            "Pick a name and a username for the bot",
            "Copy the token it sends",
          ],
        },
        {
          h: "Paste the token into Penny",
          p: "Back in Penny, paste the token into the <b>Bot token</b> field and press <b>Connect</b>. The token is stored encrypted on this computer only. If Telegram doesn't accept it, check that you copied all of it and that you're online.",
        },
        {
          h: "Link your chat",
          p: "Under <b>Step 2: Link your chat</b>, press the button that opens the bot in Telegram, and press <b>Start</b> there. That links your chat, and only yours. Penny then shows the bot as connected.",
        },
        {
          h: "Ask for a first snapshot",
          p: "The bot has two buttons: short snapshot and full snapshot. You can also send /short or /full. If you get an answer, everything works.",
        },
        {
          h: "Decide whether to hide amounts",
          p: "<b>Hide amounts in Telegram</b> hides the amounts in messages. Messages that ask you to pick a category still show the merchant name and the date.",
        },
        {
          h: "Know what will arrive",
          p: "From now on the bot sends, on its own:",
          list: [
            "A summary on Sunday, Tuesday and Thursday mornings",
            "New expenses after every sync, with what is left in each one's budget",
            "A reminder before upcoming charges",
            "An alert when a bank connection starts failing, and when it recovers",
          ],
        },
      ],
      know: [
        "The bot works while the computer running Penny is on, and stays quiet while the app is locked.",
        "Summaries and alerts pass through Telegram. It is one of the few things that leave your computer, and only because you connected the bot.",
        "To stop, press <b>Disconnect bot</b> on the same settings page.",
      ],
      faq: [
        [
          "Why do I have to create my own bot?",
          "Because there is no Penny server in between. The bot belongs to you, and its token is stored encrypted on your computer only.",
        ],
        [
          "Can someone else talk to my bot?",
          "The bot is linked to one chat, the one where you pressed Start from Penny, and it answers only that chat.",
        ],
        [
          "What else can I do from the chat?",
          `Categorise new transactions, forward the bot an SMS about a card charge so it saves it, and ask for a sync. <a href="feature-telegram-bot.html">Everything the bot does</a>.`,
        ],
      ],
    },
  },
];

export default pages;

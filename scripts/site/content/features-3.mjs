// Content for five more feature pages (AI, insurance, tools, household, where it runs). Same shape as features-1.mjs.
const GH = "https://github.com/Sergey-Bar/Penny";

const pages = [
  {
    id: "ai",
    slug: "ai-mcp",
    related: ["transactions", "import", "privacy"],
    he: {
      h1: "AI אם רוצים, בתנאים שלכם.",
      desc: "AI לבחירתכם ב-Penny: מקומי עם Ollama, ‏Claude עם מפתח משלכם, סוכן CLI שכבר מותקן, או בלי AI בכלל. מסווג תנועות, עונה על שאלות, ושרת MCP לקריאה בלבד.",
      intro:
        "הכול עובד גם בלי AI. כשמפעילים אותו, הוא מסווג את התנועות שהכללים ומילון בתי העסק לא מכירים, ועונה על שאלות על הכסף בשפה רגילה. אתם בוחרים איפה הוא רץ.",
      sections: [
        {
          h: "ארבע דרכים, ואתם בוחרים",
          p: "אפשר להחליף ספק בכל רגע בהגדרות.",
          list: [
            "Ollama: רץ על המחשב שלכם, בחינם, ואת המודלים מורידים מתוך האפליקציה",
            "Claude: בענן, עם מפתח API שלכם",
            "סוכן CLI שכבר מותקן אצלכם, כמו Claude Code, ‏Codex או Gemini CLI, במצב קריאה בלבד",
            "בלי AI: המילון והכללים שלכם",
          ],
        },
        {
          h: "מסווג רק את מה שנשאר",
          p: "תנועה חדשה מקבלת קטגוריה קודם ממה שתיקנתם בעבר לאותו בית עסק, ואחר כך ממילון מובנה של כ-200 בתי עסק ישראליים. ה-AI, אם בחרתם באחד, רואה רק את מה שנשאר.",
        },
        {
          h: "שואלים את הכסף",
          p: 'שואלים שאלה בשפה רגילה, למשל "כמה הוצאנו על אוכל בחודש שעבר?", ומקבלים תשובה מהנתונים שלכם.',
        },
        {
          h: "קורא דפי חשבון",
          p: `מדביקים דף חשבון, קבלה או הודעה, או מעלים PDF או צילום, וספק ה-AI שבחרתם מוציא מהם את התנועות. <a href="feature-import-files.html">עוד על ייבוא</a>.`,
        },
        {
          h: "שרת MCP לסוכני AI",
          p: "קלוד, ChatGPT או כל סוכן שתומך ב-MCP יכולים לשאול על הכסף של הבית: לאן הלך החודש, אילו מנויים התייקרו ומה צפוי עד המשכורת.",
          list: [
            "קריאה בלבד: אין כלי שכותב, מסווג, מסנכרן או מוחק",
            "מקומי: מדבר רק עם האפליקציה שעל המחשב שלכם",
            "לא רואה את קוד הנעילה או את פרטי הכניסה לבנק",
          ],
        },
      ],
      know: [
        "עם Ollama או בלי AI, שום דבר לא יוצא מהמחשב. עם ספק בענן, התנועות לסיווג נשלחות אליו.",
        "AI בענן עולה שבריר שקל לסנכרון, ומשולם ישירות לספק.",
        "שרת ה-MCP עובד רק כשהאפליקציה רצה, ואינו זמין כשמוגדרים בה חשבונות משתמש נפרדים.",
      ],
      faq: [
        [
          "חייבים AI כדי להשתמש ב-Penny?",
          "לא. הסיווג עובד גם בלעדיו, לפי מה שלימדתם ולפי מילון בתי העסק, וכל שאר האפליקציה לא תלויה בו.",
        ],
        [
          "מה ה-AI רואה?",
          "את התנועות שנשארו בלי קטגוריה, ואת מה שצריך כדי לענות על שאלה ששאלתם. עם Ollama הכול נשאר על המחשב.",
        ],
        [
          "איך מחברים סוכן AI ב-MCP?",
          `מפעילים את Penny ומוסיפים את שרת ה-MCP לסוכן שלכם. <a href="${GH}/blob/main/docs/mcp.md">ההוראות המלאות ורשימת הכלים</a>.`,
        ],
        [
          "סוכן AI יכול לשנות לי נתונים?",
          "לא דרך ה-MCP. השרת קורא בלבד, ואין בו כלי שמשנה, מסנכרן או מוחק.",
        ],
      ],
    },
    en: {
      h1: "AI if you want it, on your terms.",
      desc: "AI on your terms in Penny: local with Ollama, Claude with your own key, a CLI agent you already have, or no AI at all. It sorts transactions, answers questions, and there is a read-only MCP server.",
      intro:
        "Everything works without AI. Turn it on and it sorts the transactions your rules and the merchant dictionary don't know, and answers questions about your money in plain words. You choose where it runs.",
      sections: [
        {
          h: "Four ways, and you choose",
          p: "You can change provider at any time in Settings.",
          list: [
            "Ollama: runs on your computer, free, and models download from inside the app",
            "Claude: in the cloud, with your own API key",
            "A CLI agent you already have, such as Claude Code, Codex or Gemini CLI, in read-only mode",
            "No AI: the dictionary and your rules",
          ],
        },
        {
          h: "It sorts only what is left",
          p: "A new transaction gets its category first from what you corrected before for that merchant, then from a built-in dictionary of about 200 Israeli merchants. AI, if you chose one, sees only what is left.",
        },
        {
          h: "Ask your money",
          p: 'Ask a question in plain words, such as "how much did we spend on food last month?", and get an answer from your own data.',
        },
        {
          h: "It reads statements",
          p: `Paste a statement, a receipt or a message, or upload a PDF or a photo, and the AI provider you chose pulls out the transactions. <a href="feature-import-files.html">More on importing</a>.`,
        },
        {
          h: "An MCP server for AI assistants",
          p: "Claude, ChatGPT or any MCP client can ask about the household's money: where the month went, which subscriptions got more expensive and what is coming up before payday.",
          list: [
            "Read-only: no tool writes, categorises, syncs or deletes",
            "Local: it talks only to the app on your computer",
            "It never sees the lock PIN or a bank login",
          ],
        },
      ],
      know: [
        "With Ollama or no AI, nothing leaves the computer. With a cloud provider, the transactions to sort are sent to it.",
        "Cloud AI costs a fraction of a shekel per sync, paid straight to the provider.",
        "The MCP server works only while the app is running, and is not available when the app has separate user accounts.",
      ],
      faq: [
        [
          "Do I need AI to use Penny?",
          "No. Sorting works without it, from what you taught and from the merchant dictionary, and the rest of the app does not depend on it.",
        ],
        [
          "What does the AI see?",
          "The transactions left without a category, and what it needs to answer a question you asked. With Ollama it all stays on your computer.",
        ],
        [
          "How do I connect an AI assistant over MCP?",
          `Start Penny and add the MCP server to your assistant. <a href="${GH}/blob/main/docs/mcp.md">Full instructions and the list of tools</a>.`,
        ],
        [
          "Can an AI assistant change my data?",
          "Not through MCP. The server only reads, and has no tool that changes, syncs or deletes anything.",
        ],
      ],
    },
  },
  {
    id: "insurance",
    slug: "insurance-family-document",
    demo: "/insurance",
    related: ["pension", "table", "networth"],
    he: {
      h1: "כל הפוליסות, והמסמך שמישהו יצטרך יום אחד.",
      desc: "כל הביטוחים של הבית במקום אחד: כיסוי, השתתפות עצמית, תאריך חידוש וסוכן, כמה באמת שילמתם, בדיקת ביטוח כפול, ומסמך למשפחה.",
      intro:
        "ביטוחים מפוזרים בין חברות, סוכנים וחיובים בבנק. Penny מרכזת אותם ברשימה אחת, מראה כמה הם באמת עולים, ומכינה מסמך למי שיצטרך למצוא הכול.",
      sections: [
        {
          h: "כל הפוליסות ברשימה אחת",
          p: "לכל פוליסה רואים מה היא מכסה, מה ההשתתפות העצמית, מתי היא מתחדשת ומי הסוכן, ואפשר לצרף לה את המסמכים שלה.",
          shot: "demo/insurance",
          alt: "מסך הביטוחים: פרמיה חודשית, כמה שולם בשנה האחרונה, והפוליסות עם תאריכי החידוש",
        },
        {
          h: "כמה באמת שילמתם",
          p: "התשלומים שיוצאים מהבנק ומהכרטיס מותאמים לפוליסה שלהם, כך שרואים כמה שולם בפועל על כל אחת בשנה האחרונה, ולא רק את הפרמיה שכתובה בפוליסה.",
        },
        {
          h: "בדיקת ביטוח כפול",
          p: 'Penny מסמנת פוליסות שנראות חופפות, כדי שתבדקו אם אתם משלמים פעמיים על אותו כיסוי. ביטוחים חופפים נספרים גם ב"כסף על השולחן".',
        },
        {
          h: "הביטוחים שבדוח הפנסיה",
          p: `כשמייבאים את דוח הסוכן, כל פוליסה שבו נכנסת לרשימת הביטוחים. <a href="feature-pension-savings.html">עוד על פנסיה וחיסכון</a>.`,
        },
        {
          h: "מסמך למשפחה",
          p: "מסמך אחד ליום שמישהו אחר יצטרך למצוא הכול.",
        },
      ],
      know: [
        "הבדיקה מסמנת חשד לחפיפה. את ההחלטה אם לבטל פוליסה מקבלים אתם, מול חברת הביטוח או הסוכן.",
        "זו לא המלצה ולא ייעוץ ביטוחי.",
        "הפוליסות והמסמכים נשמרים על המחשב שלכם, כמו כל שאר הנתונים.",
      ],
      faq: [
        [
          "איך מוסיפים פוליסה?",
          "ידנית במסך הביטוחים, או בייבוא דוח הסוכן, שמכניס את הפוליסות שבו.",
        ],
        [
          "איך Penny יודעת כמה שילמתי?",
          "היא מתאימה חיובים מהבנק ומהכרטיס לפוליסה שלהם, וסוכמת את מה ששולם בשנה האחרונה.",
        ],
        [
          "מה זה ביטוח כפול?",
          "שתי פוליסות שמכסות את אותו דבר, למשל שני ביטוחי בריאות. Penny מסמנת מקרים כאלה כדי שתבדקו אותם.",
        ],
        [
          "למה צריך מסמך למשפחה?",
          "כדי שאם יקרה משהו, מי שנשאר לא יצטרך לחפש אילו חשבונות, חסכונות וביטוחים יש לבית.",
        ],
      ],
    },
    en: {
      h1: "Every policy, and the document someone will need one day.",
      desc: "All the household's insurance in one place: coverage, excess, renewal date and agent, what you actually paid, a double-insurance check, and a family document.",
      intro:
        "Insurance is scattered across companies, agents and bank charges. Penny gathers it into one list, shows what it really costs, and prepares a document for whoever will need to find everything.",
      sections: [
        {
          h: "Every policy in one list",
          p: "For each policy you see what it covers, the excess, when it renews and who the agent is, and you can attach its documents.",
          shot: "demo/insurance",
          alt: "The insurance screen: monthly premium, paid in the last year, and policies with their renewal dates",
        },
        {
          h: "What you actually paid",
          p: "Payments leaving your bank and card are matched to their policy, so you see what was really paid for each one in the last year, not just the premium written in the policy.",
        },
        {
          h: "A double-insurance check",
          p: 'Penny flags policies that look like they overlap, so you can check whether you are paying twice for the same cover. Overlapping insurance also counts in "Money on the table".',
        },
        {
          h: "Insurance from your pension report",
          p: `When you import your agent's report, each policy in it lands in the insurance list. <a href="feature-pension-savings.html">More on pension and savings</a>.`,
        },
        {
          h: "A family document",
          p: "One document for the day someone else needs to find everything.",
        },
      ],
      know: [
        "The check flags a suspected overlap. Whether to cancel a policy is your decision, with the insurer or your agent.",
        "This is not a recommendation or insurance advice.",
        "Policies and documents are stored on your computer, like the rest of your data.",
      ],
      faq: [
        [
          "How do I add a policy?",
          "By hand on the insurance screen, or by importing your agent's report, which brings in the policies it lists.",
        ],
        [
          "How does Penny know what I paid?",
          "It matches charges from your bank and card to their policy, and adds up what was paid in the last year.",
        ],
        [
          "What is double insurance?",
          "Two policies that cover the same thing, such as two health policies. Penny flags these so you can check them.",
        ],
        [
          "Why a family document?",
          "So that if something happens, whoever is left doesn't have to search for which accounts, savings and insurance the household has.",
        ],
      ],
    },
  },
  {
    id: "tools",
    slug: "israeli-money-tools",
    demo: "/calculators",
    related: ["pension", "networth", "forecasts"],
    he: {
      h1: "כלים לכסף בישראל, עם המספרים של השנה.",
      desc: "יותר מ-25 מחשבונים וכלים מודרכים לכסף בישראל: החזר מס ונקודות זיכוי, משכנתא לפי כללי בנק ישראל, פנסיה, זכויות וכסף שנשכח. כל אחד עם השנה שהנתונים שלו תקפים לה.",
      intro:
        "יותר מ-25 מחשבונים וכלים מודרכים, מסודרים לפי שלב בחיים. כל אחד מסומן בשנה שהנתונים שלו תקפים לה, כך שיודעים על מה החישוב נשען.",
      sections: [
        {
          h: "מחשבונים לפי שלב בחיים",
          p: "חיסכון והשקעה, בית, רכב, שכר ופרישה: בוחרים את ההחלטה שעומדת לפניכם.",
          shot: "assets/shots/calculators",
          alt: "מסך המחשבונים, מקובץ לפי נושא: חיסכון והשקעה, בית, רכב ושכר",
        },
        {
          h: "מס",
          p: "בודקים אם מגיע לכם כסף בחזרה.",
          list: [
            "נקודות זיכוי ובדיקת החזר מס, עם רשימת מסמכים לטופס 135",
            "הפקדות לפנסיה ולהשתלמות שמזכות בהטבת מס",
            "קיזוז הפסדים (טופס 867)",
            "מברוטו לנטו",
          ],
        },
        {
          h: "החלטות גדולות",
          p: "דירה ורכב הן ההחלטות היקרות ביותר של רוב הבתים.",
          list: [
            "משכנתא עם מסלולים, לפי כללי בנק ישראל",
            "לפרוע מוקדם או להשקיע",
            "לשכור או לקנות",
            "דירה בהנחה",
            "עלות רכב, וליסינג מול קנייה",
          ],
          shot: "assets/shots/mortgage",
          alt: "מחשבון המשכנתא: נתוני הבסיס וחלוקה למסלולים",
        },
        {
          h: "פנסיה ופרישה",
          p: `דמי הניהול שלכם מול השוק, בחירת מסלול השקעה, קצבה או היוון, פיצויים כשמחליפים עבודה וגשר לפרישה מוקדמת עד גיל 67. <a href="feature-pension-savings.html">עוד על פנסיה וחיסכון</a>.`,
        },
        {
          h: "רשת ביטחון ויום-יום",
          p: "הדברים הקטנים שמצטברים.",
          list: [
            "קרן חירום",
            "כסף שנשכח (הר הכסף) ובדיקת זכויות",
            "עמלות הבנק מול המסלול הבסיסי",
            "יציאה מחובות ועלות הלוואה",
            "מרכז ידע עם מדריכים קצרים, וטיפ יומי",
          ],
        },
      ],
      know: [
        "המחשבונים נותנים הערכה, לא ייעוץ מס, פנסיה או השקעות.",
        "נתוני המס בכל כלי מסומנים בשנה שהם תקפים לה.",
        "החישובים נעשים על המחשב שלכם.",
      ],
      faq: [
        [
          "המחשבונים מעודכנים?",
          "כל כלי מציג את השנה שהנתונים שלו תקפים לה, כך שרואים מיד אם המספרים עדכניים.",
        ],
        [
          "זה מחליף רואה חשבון או יועץ?",
          "לא. הכלים נותנים הערכה ועוזרים להגיע מוכנים. להחלטה עצמה כדאי להתייעץ עם בעל מקצוע.",
        ],
        ["צריך לחבר בנק כדי להשתמש במחשבונים?", "לא. מזינים את המספרים בעצמכם, והמחשבון עובד."],
        [
          "יש כלי לבדיקת החזר מס?",
          "כן. בדיקת נקודות זיכוי והחזר מס, עם רשימת המסמכים שצריך לטופס 135.",
        ],
      ],
    },
    en: {
      h1: "Israeli money tools, with this year's numbers.",
      desc: "More than 25 calculators and guided tools for money in Israel: tax refund and credit points, mortgage under Bank of Israel rules, pension, benefits and forgotten money. Each marked with the year its figures are valid for.",
      intro:
        "More than 25 calculators and guided tools, ordered by life stage. Each is marked with the year its figures are valid for, so you know what the calculation rests on.",
      sections: [
        {
          h: "Calculators by life stage",
          p: "Saving and investing, home, car, salary and retirement: pick the decision in front of you.",
          shot: "assets/shots/calculators",
          alt: "The calculators screen, grouped by topic: saving and investing, home, car and salary",
        },
        {
          h: "Tax",
          p: "Check whether you are owed money back.",
          list: [
            "Credit points and a tax-refund check, with a Form 135 checklist",
            "Pension and study fund deposits that earn a tax benefit",
            "Loss offset (Form 867)",
            "Net from gross",
          ],
        },
        {
          h: "Big decisions",
          p: "A home and a car are the most expensive decisions most households make.",
          list: [
            "Mortgage with tracks, under Bank of Israel rules",
            "Prepay or invest",
            "Rent or buy",
            "A discounted home",
            "Car cost, and lease versus buy",
          ],
          shot: "assets/shots/mortgage",
          alt: "The mortgage calculator: the basic figures and the split into tracks",
        },
        {
          h: "Pension and retirement",
          p: `Your fees against the market, choosing an investment track, annuity or lump sum, severance when changing jobs, and an early-retirement bridge to 67. <a href="feature-pension-savings.html">More on pension and savings</a>.`,
        },
        {
          h: "Safety net and everyday",
          p: "The small things that add up.",
          list: [
            "Emergency fund",
            "Forgotten money (Har HaKesef) and a benefits check",
            "Bank fees against the basic track",
            "Debt payoff and loan cost",
            "A knowledge centre of short guides, and a daily tip",
          ],
        },
      ],
      know: [
        "Calculators give estimates, not tax, pension or investment advice.",
        "The tax figures in each tool are marked with the year they are valid for.",
        "The calculations run on your computer.",
      ],
      faq: [
        [
          "Are the calculators up to date?",
          "Each tool shows the year its figures are valid for, so you can see at once whether the numbers are current.",
        ],
        [
          "Does this replace an accountant or an advisor?",
          "No. The tools give an estimate and help you arrive prepared. For the decision itself, talk to a professional.",
        ],
        [
          "Do I need to connect a bank to use the calculators?",
          "No. You enter the numbers yourself and the calculator works.",
        ],
        [
          "Is there a tool to check for a tax refund?",
          "Yes. A credit points and tax-refund check, with the list of documents Form 135 needs.",
        ],
      ],
    },
  },
  {
    id: "household",
    slug: "household-profiles",
    demo: "/profiles",
    related: ["budgets", "transactions", "privacy"],
    he: {
      h1: "משק בית אחד, ולכל אחד המסך שלו.",
      desc: "פרופילים לכל בני הבית על אותו משק בית, התחשבנות עם אנשים, חלק עסקי ודוח עסקי, סיכום חודשי, מאמן בשם פיפ ותפריט נגישות שנשמר לכל פרופיל.",
      intro:
        "כסף של בית הוא של כמה אנשים. כולם רואים את אותם חשבונות ואותו תקציב, וכל אחד מסדר לעצמו את המסך כמו שנוח לו.",
      sections: [
        {
          h: "פרופילים שחולקים משק בית אחד",
          p: 'במסך "מי משתמש?" בוחרים פרופיל. לכל אחד התמונה שלו, סידור מסך הבית שלו והגדרות הנגישות שלו, והנתונים משותפים לכולם.',
        },
        {
          h: "התחשבנות עם אנשים",
          p: 'מסמנים מי חייב לכם חלק מהוצאה, ורואים כמה כל אחד חייב. כשהחזירו, "החזיר הכול" בלחיצה אחת.',
        },
        {
          h: "חלק עסקי ודוח עסקי",
          p: "לתנועה שחלקה עבודה מסמנים אחוז עסקי. הדוחות האישיים מציגים רק את החלק של הבית, והדוח העסקי מקבץ את החלק העסקי לפי חודש, קטגוריה ובית עסק, עם ייצוא CSV.",
        },
        {
          h: "סיכום חודשי, סקירות ומאמן",
          p: "כמה דרכים קצרות להבין איך היה החודש.",
          list: [
            "סיכום חודשי, והמסע שלכם עם הרגעים הגדולים של הבית",
            "סקירות מודרכות בחמישה סבבים קצרים",
            "בדיקת רווחה כלכלית",
            "פיפ, המאמן של הבית: התראות, תובנות ועצות לפי סדר חשיבות",
          ],
          shot: "assets/shots/recap",
          alt: "סיכום תקופה: החודש במשפט אחד, כמה נשאר בצד וכמה יצא",
        },
        {
          h: "נגישות, לכל פרופיל בנפרד",
          p: "תפריט הנגישות (Alt+A) שומר לכל פרופיל את ההתאמות שלו: גודל טקסט, ניגודיות, גופן קריא, עצירת אנימציות ועוד.",
          shot: "assets/shots/a11y",
          alt: "הגדרות הנגישות: גודל טקסט, ניגודיות והתאמות נוספות",
        },
      ],
      know: [
        "פרופילים הם לבני אותו בית ורואים את אותם נתונים. להפרדה עם כניסה והרשאות יש סביבות עבודה.",
        "האפליקציה בעברית ובאנגלית, עם פריסה מלאה מימין לשמאל.",
        'הצהרת הנגישות נכתבה בהתאם לת"י 5568 ו-WCAG 2.2 AA.',
      ],
      faq: [
        [
          "לכל בן זוג יש נתונים נפרדים?",
          "לא. כל הפרופילים חולקים משק בית אחד. מה שנפרד הוא סידור המסך, התמונה והגדרות הנגישות.",
        ],
        [
          "אפשר לעקוב אחרי כסף שחברים חייבים לי?",
          "כן. מסמנים בהוצאה מי חייב חלק ממנה, ורואים כמה כל אחד חייב עד שהחזיר.",
        ],
        [
          "אני עצמאי. אפשר להפריד הוצאות עסק?",
          "מסמנים אחוז עסקי בתנועה. הסכום המלא נשאר בתזרים, הדוחות האישיים מציגים את החלק של הבית, והדוח העסקי את השאר. Penny אינה תוכנת הנהלת חשבונות.",
        ],
        [
          "מי זה פיפ?",
          "מלווה קטן שמצב הרוח שלו משתנה לפי מצב הכסף של הבית, והוא גם המאמן: התראות, תובנות ועצות במקום אחד.",
        ],
      ],
    },
    en: {
      h1: "One household, and everyone gets their own screen.",
      desc: "Profiles for everyone at home on the same household, splitting with people, a business share and report, a monthly recap, a coach called Pip, and an accessibility menu saved per profile.",
      intro:
        "A household's money belongs to several people. Everyone sees the same accounts and the same budget, and each person arranges their own screen the way that suits them.",
      sections: [
        {
          h: "Profiles that share one household",
          p: 'Pick a profile on the "who\'s using?" screen. Each has its own picture, its own home layout and its own accessibility choices, and the data is shared by all.',
        },
        {
          h: "Splitting with people",
          p: 'Mark who owes you part of an expense and see what each person owes. When they pay, "paid it all back" takes one tap.',
        },
        {
          h: "A business share and a business report",
          p: "A transaction that is partly work gets a business percentage. Personal reports show only the household's share, and the business report groups the business share by month, category and merchant, with CSV export.",
        },
        {
          h: "Monthly recap, reviews and a coach",
          p: "A few short ways to understand how the month went.",
          list: [
            "A monthly recap, and your journey with the household's big moments",
            "Guided reviews in five short rounds",
            "A well-being check",
            "Pip, the household coach: alerts, insights and ranked advice",
          ],
          shot: "assets/shots/recap",
          alt: "Period recap: the month in one sentence, what was set aside and what went out",
        },
        {
          h: "Accessibility, per profile",
          p: "The accessibility menu (Alt+A) saves each profile's own choices: text size, contrast, a readable font, stopping animations and more.",
          shot: "assets/shots/a11y",
          alt: "Accessibility settings: text size, contrast and further adjustments",
        },
      ],
      know: [
        "Profiles are for people in the same home and see the same data. For separation with sign-in and permissions there are workspaces.",
        "The app is in Hebrew and English, with a full right-to-left layout.",
        "The accessibility statement is written in line with IS 5568 and WCAG 2.2 AA.",
      ],
      faq: [
        [
          "Does each partner have separate data?",
          "No. All profiles share one household. What is separate is the screen layout, the picture and the accessibility choices.",
        ],
        [
          "Can I track money friends owe me?",
          "Yes. Mark on the expense who owes part of it, and see what each person owes until they pay.",
        ],
        [
          "I'm self-employed. Can I separate business expenses?",
          "Mark a business percentage on the transaction. The full amount stays in the cash flow, personal reports show the household's share, and the business report shows the rest. Penny is not bookkeeping software.",
        ],
        [
          "Who is Pip?",
          "A small companion whose mood follows the household's finances, and also the coach: alerts, insights and advice in one place.",
        ],
      ],
    },
  },
  {
    id: "anywhere",
    slug: "desktop-docker-phone",
    related: ["privacy", "telegram", "household"],
    he: {
      h1: "רצה איפה שנוח לכם.",
      desc: "Penny כאפליקציה ל-Windows ול-Mac, כשירות ברקע, ב-Docker על שרת ביתי או נאס, ובטלפון ברשת הביתית. מחוץ לבית, בוט הטלגרם מעדכן.",
      intro:
        "אפליקציה למחשב לרוב הבתים, קונטיינר למחשב שתמיד דולק, והטלפון שלכם ברשת הביתית. בכל המקרים הנתונים נשארים אצלכם.",
      sections: [
        {
          h: "אפליקציה למחשב",
          p: `קובצי התקנה ל-Windows ול-Mac, בלי טרמינל. ב-Windows היא מתעדכנת לבד, וב-Mac מופיע באנר כשיש גרסה חדשה. <a href="install.html">להורדה ולהוראות</a>.`,
        },
        {
          h: "עולה עם המחשב",
          p: "שירות ברקע מסנכרן כל יום, כך שהמספרים טריים כשפותחים את האפליקציה.",
        },
        {
          h: "Docker, שרת ביתי או נאס",
          p: "פקודה אחת ב-Windows, ב-Mac או בלינוקס.",
          list: [
            "Penny, הסקרייפרים ו-Chromium בקונטיינר, מבודדים מהמחשב",
            "עדכון מגבה קודם, וחוזר לגרסה הקודמת אם החדשה לא תקינה",
            "על מחשב שתמיד דולק נכנסים לפי הכתובת שלו, שרשומה ב-PENNY_ALLOWED_HOSTS, עם נעילה",
          ],
        },
        {
          h: "הטלפון, בבית",
          p: "מפעילים גישה מהטלפון מאחורי הנעילה, פותחים את Penny ברשת הביתית ומוסיפים אותה למסך הבית.",
        },
        {
          h: "מחוץ לבית",
          p: `בוט הטלגרם הוא החלון החוצה: סיכומים, תזכורות וסנכרון לפי בקשה, בלי לפתוח את האפליקציה לאינטרנט. <a href="feature-telegram-bot.html">עוד על הבוט</a>.`,
        },
      ],
      know: [
        "אין אפליקציה בחנות, ואין גישה מחוץ לבית, בכוונה.",
        "הסנכרון רץ כשהמחשב דולק.",
        "גישה מהטלפון כבויה כברירת מחדל ודורשת נעילה. ברשת הביתית התעבורה אינה מוצפנת, אז מפעילים אותה רק ברשת שאתם סומכים עליה.",
        "למשק בית עם כמה משתמשים יש סביבות עבודה עם כניסה, והרשאות צפייה או עריכה.",
      ],
      faq: [
        [
          "יש אפליקציה לטלפון?",
          "אין אפליקציה בחנות, אבל אפשר לפתוח את Penny מהטלפון ברשת הביתית (בהפעלה מפורשת ועם נעילה) ולהתקין אותה למסך הבית. מחוץ לבית, בוט הטלגרם מעדכן אתכם.",
        ],
        ["צריך להבין במחשבים?", "לא. ב-Windows וב-Mac מורידים קובץ התקנה ומפעילים, בלי טרמינל."],
        [
          "מה עדיף, אפליקציה או Docker?",
          "לרוב הבתים, האפליקציה. Docker מתאים ללינוקס, לשרת ביתי או לנאס, ולמי שרוצה את Penny מבודדת מהמחשב.",
        ],
        [
          "המחשב חייב להיות דולק כל הזמן?",
          "לא, אבל הסנכרון והבוט פועלים רק כשהוא דולק. מי שרוצה שזה ירוץ תמיד מתקין על מחשב שתמיד דולק.",
        ],
      ],
    },
    en: {
      h1: "Runs where you want it.",
      desc: "Penny as a Windows and Mac app, as a background service, in Docker on a home server or NAS, and on your phone on the home network. Away from home, the Telegram bot keeps you posted.",
      intro:
        "A desktop app for most homes, a container for the always-on computer, and your phone on the home network. In every case your data stays with you.",
      sections: [
        {
          h: "A desktop app",
          p: `Installers for Windows and Mac, no terminal. On Windows it updates itself, and on a Mac a banner appears when a new version is out. <a href="install.html">Download and instructions</a>.`,
        },
        {
          h: "Starts with the computer",
          p: "A background service syncs every day, so the numbers are fresh when you open the app.",
        },
        {
          h: "Docker, a home server or a NAS",
          p: "One command on Windows, Mac or Linux.",
          list: [
            "Penny, its scrapers and Chromium in a container, isolated from your machine",
            "An update backs up first, and rolls back if the new version isn't healthy",
            "On an always-on machine, reach it by its address, listed in PENNY_ALLOWED_HOSTS, with the lock on",
          ],
        },
        {
          h: "Your phone, at home",
          p: "Turn on phone access behind the app lock, open Penny on your home network and add it to the home screen.",
        },
        {
          h: "Away from home",
          p: `The Telegram bot is your window out: summaries, reminders and a sync on request, without opening the app to the internet. <a href="feature-telegram-bot.html">More on the bot</a>.`,
        },
      ],
      know: [
        "There is no store app and no access from outside your home, on purpose.",
        "Sync runs while the computer is on.",
        "Phone access is off by default and needs the app lock. Traffic on the home network is not encrypted, so turn it on only on a network you trust.",
        "For a household with several users there are workspaces with sign-in, and viewer or editor permissions.",
      ],
      faq: [
        [
          "Is there a phone app?",
          "There is no store app, but you can open Penny from your phone on the home network (turned on explicitly, with the lock) and install it to the home screen. Away from home, the Telegram bot keeps you posted.",
        ],
        [
          "Do I need to be technical?",
          "No. On Windows and Mac you download an installer and run it, with no terminal.",
        ],
        [
          "Which is better, the app or Docker?",
          "For most homes, the app. Docker suits Linux, a home server or a NAS, and anyone who wants Penny isolated from their machine.",
        ],
        [
          "Does the computer have to stay on?",
          "No, but sync and the bot work only while it is on. If you want it always running, install it on a machine that is always on.",
        ],
      ],
    },
  },
];

export default pages;

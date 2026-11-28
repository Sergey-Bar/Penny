/**
 * Common Israeli merchants and payees, and the category each one almost always is, so new transactions get a
 * category without AI and without a network. Only unambiguous names are listed: a chain that sells several kinds
 * of things (a drugstore, a department store) is left for the user, memory or AI. More specific patterns come
 * first ("רמי לוי תקשורת" before "רמי לוי", "פזגז" before "פז"). Category names are the app's seeded English names.
 * Hebrew has no \b, so Hebrew words are bounded by (^|[^א-ת]) and (?![א-ת]).
 */
import { categoryKeyForName } from "@/lib/category-keys";

const he = (words: string) => new RegExp(`(^|[^א-ת])(?:${words})(?![א-ת])`);
const en = (words: string) => new RegExp(`\\b(?:${words})\\b`, "i");

type Entry = [RegExp, string];

const EXPENSE: Entry[] = [
  // Government and the state.
  [he("ביטוח לאומי|המוסד לביטוח לאומי"), "National Insurance"],
  [he("מס הכנסה|רשות המסים"), "Income Tax"],
  [he("משרד הרישוי|רשות הרישוי|אגרת רישוי"), "Car Test & License"],
  // Telecom before the chains and fuel companies that share names.
  [
    he(
      "רמי לוי תקשורת|הוט מובייל|פרטנר|סלקום|גולן טלקום|פלאפון|וי קום|we4g|019 מובייל|012 מובייל|אקספון|מרקטפרו",
    ),
    "Mobile Phone",
  ],
  [en("partner communications|cellcom|pelephone|golan telecom|hot mobile|xphone"), "Mobile Phone"],
  [
    he("בזק|הוט|יס|סטינג|פרטנר טי וי|סלקום טי וי|בזק בינלאומי|אינטרנט רימון|טריפל סי"),
    "Internet & TV",
  ],
  [en("bezeq|yes satellite|sting tv|partner tv|cellcom tv"), "Internet & TV"],
  // Utilities.
  [
    he("חברת החשמל|חשמל לישראל|חח\"י|אלקטרה פאוור|אמישראגז חשמל|סלקום אנרג'י|פזגז חשמל"),
    "Electricity",
  ],
  [en("israel electric"), "Electricity"],
  [he("סופרגז|פזגז|אמישראגז|דורגז|גז יגל"), "Gas"],
  [
    he(
      "מי אביבים|מי שבע|מי כרמל|מי רעננה|מי נתניה|מי ציונה|מי רהט|מי הוד השרון|מי הרצליה|מי מודיעין|הגיחון|מי לוד|מי עירון|מי רמת גן|מי גבעתיים|מי בת ים|מי חולון|מי ראשון|מי אשקלון|מי אשדוד|תאגיד המים|תאגיד מים|מניב ראשון|פלגי מוצקין|עין אפק|מי שמש|מעיינות",
    ),
    "Water",
  ],
  [he("ארנונה|עיריית|עירית|מועצה מקומית|מועצה אזורית"), "Arnona"],
  [he("ועד בית|ועד הבית"), "Building Committee"],
  [he("שכר דירה|שכירות"), "Rent"],
  [he("ביטוח משכנתא"), "Insurance"],
  [he("משכנתא|משכנתה"), "Mortgage"],
  // Fuel and cars.
  [he("פז|פז ילו|סונול|דור אלון|דלק|טן דלק|תחנת דלק"), "Fuel"],
  [en("paz|yellow|sonol|dor alon|delek|ten fuel"), "Fuel"],
  [he("פנגו|סלופארק|אחוזת החוף|חניון|חניה"), "Parking"],
  [en("pango|cellopark"), "Parking"],
  [he("מוסך|צמיגי|פנצ'רייה|שטיפת רכב"), "Car Maintenance"],
  [
    he("רב קו|רב-קו|רכבת ישראל|אגד|מטרופולין|אפיקים|קווים|סופרבוס|אלקטרה אפיקים|מוביט"),
    "Public Transport",
  ],
  [en("israel railways|rav kav|egged|moovit"), "Public Transport"],
  [he("גט טקסי|יאנגו|מונית"), "Taxis"],
  [en("gett|yango|uber"), "Taxis"],
  // Food.
  [he("וולט|תן ביס|משלוחה"), "Food Delivery"],
  [en("wolt|10bis|tenbis"), "Food Delivery"],
  [he("ארומה|קפה קפה|גרג|קופיקס|לנדוור|קפה ג'ו|אילנ'ס|נחת קפה"), "Coffee & Cafes"],
  [en("aroma|cofix|landwer|cafe joe|greg cafe"), "Coffee & Cafes"],
  [he("רולדין|ברד וויל|לחם ארז|אנג'ל|מאפיית"), "Bakery"],
  [
    he("מקדונלדס|בורגר קינג|דומינוס|פיצה האט|ביג אפל|שגב אקספרס|BBB|מוזס|אגדיר|גירף"),
    "Restaurants",
  ],
  [en("mcdonald'?s|burger king|domino'?s|pizza hut|kfc|bbb"), "Restaurants"],
  [
    he(
      "שופרסל|רמי לוי|ויקטורי|יוחננוף|אושר עד|מגה בעיר|טיב טעם|יינות ביתן|חצי חינם|קרפור|סופר יודה|מחסני השוק|נתיב החסד|קשת טעמים|זול ובגדול|סיטי מרקט|פרש מרקט|אם פם|AM:PM|סופר דוש|שוק העיר|ברכת השדה",
    ),
    "Groceries",
  ],
  [en("shufersal|rami levy|victory|yochananof|osher ad|carrefour|am:?pm|tiv taam"), "Groceries"],
  // Health.
  [
    he(
      "מכבי שירותי בריאות|כללית שירותי בריאות|שירותי בריאות כללית|קופת חולים|מאוחדת|לאומית שירותי בריאות",
    ),
    "Health Fund",
  ],
  [he("רופא שיניים|מרפאת שיניים"), "Dentist"],
  [he("אופטיקה|משקפיים"), "Optics"],
  // Kids.
  [he("צהרון|גן ילדים|מעון יום|פעוטון"), "Daycare & After-school"],
  // Subscriptions and streaming.
  [
    en(
      "netflix|spotify|disney\\+?|hbo max|max\\.com|youtube premium|apple tv|amazon prime video|deezer",
    ),
    "Streaming",
  ],
  [he("נטפליקס|ספוטיפיי"), "Streaming"],
  [
    en(
      "icloud|google one|google storage|chatgpt|openai|microsoft 365|office 365|dropbox|adobe|canva|apple\\.com/bill",
    ),
    "Subscriptions",
  ],
  // Shopping.
  [he("KSP|באג מולטיסיסטם|איביי|אייבורי|מחסני חשמל|שקם אלקטריק"), "Electronics"],
  [en("ksp|ivory|bug multisystem"), "Electronics"],
  [he("איקאה|עצמלה"), "Furniture"],
  [en("ikea"), "Furniture"],
  [he("הום סנטר|אייס|ביתילי|טמבור"), "Home"],
  [en("home center|ace hardware"), "Home"],
  [
    he("זארה|קסטרו|פוקס|גולף|אמריקן איגל|טרמינל איקס|רנואר|מנגו|נייקי|אדידס|ברשקה|פול אנד בר|H&M"),
    "Clothing & Shoes",
  ],
  [
    en(
      "zara|castro|terminal ?x|shein|nike|adidas|mango|bershka|pull ?& ?bear|h&m|american eagle|renuar",
    ),
    "Clothing & Shoes",
  ],
  [he("עלי אקספרס|אמזון|טמו"), "Shopping"],
  [en("aliexpress|amazon|temu"), "Shopping"],
  [he("מספרה"), "Haircuts"],
  // Leisure.
  [he("סינמה סיטי|יס פלאנט|רב חן|לב סינמה|סינמטק"), "Entertainment"],
  [en("cinema city|yes planet|eventim"), "Entertainment"],
  [he("הולמס פלייס|גו אקטיב|ספייס|מכון כושר|קאנטרי"), "Sports & Hobbies"],
  [en("holmes place|go active"), "Sports & Hobbies"],
  [he("סטימצקי|צומת ספרים"), "Books"],
  [he("אל על|ישראייר|ארקיע|בוקינג"), "Travel"],
  [
    en(
      "el al|israir|arkia|booking\\.com|airbnb|expedia|wizz ?air|ryanair|easyjet|agoda|hotels\\.com",
    ),
    "Travel",
  ],
  // Money.
  [he("משיכת מזומן|משיכה מכספומט|כספומט"), "Cash & ATM"],
  [en("atm|cash withdrawal"), "Cash & ATM"],
  [he("עמלת|עמלה|דמי ניהול חשבון|דמי כרטיס"), "Bank Fees"],
  [he("ריבית חובה|ריבית על יתרת חובה"), "Interest"],
  // Giving.
  [he("תרומה|תרומת|עמותת|ע\"ר|ג'יגיב|ישראל גיבס"), "Donations"],
  [en("jgive|israelgives|donation"), "Donations"],
  // Categories that had no positive pattern yet (plan: full leaf coverage, or MANUAL_ONLY).
  [he("שיפוצים|קבלן|קבלנים|הום סנטר|עצמלה|חומרי בניין|אייס|ace"), "Renovations"],
  [en("ace hardware|home ?center|homedepot"), "Renovations"],
  [he("חוג|חוגים|סטודיו|מדריך|מדריכה|קייטנה"), "Kids Activities"],
  [he("שכר לימוד|אוניברסיטה|מכללה|אוניברסיטה פתוחה|בית ספר"), "Tuition"],
  [en("tuition|university|college"), "Tuition"],
  [he("קוסמטיקה|ספורה|בושם|איפור|קרם"), "Cosmetics"],
  [en("sephora|sephora|cosmetics|ulta"), "Cosmetics"],
  [he("אירועים|שמחות|מתנות|מתנה|בר מצווה|בת מצווה|חתונה"), "Gifts & Events"],
  [en("gift|gifts|events"), "Gifts & Events"],
  [he("החזר הלוואה|החזר הלוואות|פירעון הלוואה|הלוואה"), "Loans"],
  [en("loan repayment|loan"), "Loans"],
  [he("קרן השתלמות|קופת גמל|קופת פנסיה|פיקדון|חיסכון|חיסכון חודשי"), "Savings"],
  [en("gemel|hishtalmut|savings|deposit plan"), "Savings"],
  [he("קרנות נאמנות|תיק השקעות|ברוקר|אקסלנס|מיטב|פסגות|בלינק"), "Investments"],
  [en("broker|mutual fund|excellence|meitav|psagot|blink|interactive brokers"), "Investments"],
  [he("סופר פארם|סופר-פארם|בי פארם|ניו פארם|בית מרקחת|תרופות"), "Medications"],
  [en("pharmacy|super ?pharm|be pharm"), "Medications"],
  [he("עוזרת בית|ניקיון|חברת ניקיון|שטיפת שטיחים"), "Cleaning"],
  [en("cleaning service|cleaner|maid"), "Cleaning"],
  [he("ציוד לימוד|ציוד לבית ספר|קלמר|מחברות|ספרי לימוד"), "School Supplies"],
  [en("school supplies|stationery"), "School Supplies"],
  [he("ביגוד ילדים|נעלי ילדים|בגדי תינוקות"), "Kids Clothing"],
  [en("kids clothing|baby clothes"), "Kids Clothing"],
  [he("דמי כיס"), "Pocket Money"],
  [he("וטרינר|מרפאה וטרינרית|חיסון לכלב|חיסון לחתול"), "Vet"],
  [en("veterinar|vet clinic"), "Vet"],
  [he("מזון לחיות|מזון לכלבים|מזון לחתולים|פט שופ"), "Pet Food"],
  [en("pet food|pet shop|petsmart"), "Pet Food"],
  [he("מוסך|טיפולי רכב|טיפול לרכב|החלפת שמן|צמיגים"), "Car Maintenance"],
  [en("garage|car service|tire|tyres|oil change"), "Car Maintenance"],
  [he("שכר דירה|שכירות|שכר דיור"), "Rent"],
  [en("rent payment|monthly rent"), "Rent"],
  [he("ביטוח חיים"), "Life Insurance"],
  [en("life insurance"), "Life Insurance"],
  [he("ביטוח בריאות|ביטוח סיעודי|אובדן כושר"), "Health Insurance"],
  [en("health insurance|disability insurance"), "Health Insurance"],
  [he("ביטוח רכב|ביטוח מקיף|ביטוח חובה"), "Car Insurance"],
  [en("car insurance|auto insurance"), "Car Insurance"],
  [he("ביטוח משכנתא|ביטוח דירה|ביטוח מבנה|ביטוח תכולה"), "Insurance"],
  [en("home insurance|property insurance|mortgage insurance"), "Insurance"],
  [he('עמלת המרה|עמלת מט"ח|עמלת חו"ל'), "Bank Fees"],
  [en("foreign transaction fee|conversion fee"), "Bank Fees"],
  [he("ריבית חובה|ריבית על יתרת חובה|ריבית בגין|ריבית משיכת יתר"), "Interest"],
  [en("overdraft interest|interest charge"), "Interest"],
];

const INCOME: Entry[] = [
  [he("משכורת|שכר עבודה"), "Salary"],
  [
    he("קצבת ילדים|דמי לידה|דמי אבטלה|קצבת זקנה|קצבת נכות|ביטוח לאומי|מענק עבודה"),
    "Benefits & Allowances",
  ],
  [he("החזר מס|החזר מס הכנסה"), "Tax Refunds"],
  [he("דיבידנד|ריבית זכות"), "Investment Income"],
  [he("שכר דירה|הכנסה משכירות|שכירות"), "Rental Income"],
  [en("rental income|rent received"), "Rental Income"],
  [he("פנסיה|קצבת פנסיה|גמלה"), "Pension"],
  [en("pension"), "Pension"],
  [he("חשבונית|פרילנס|ייעוץ|עבודה עצמאית|הכנסה מעסק"), "Freelance & Side Income"],
  [en("freelance|consulting|invoice|self employed"), "Freelance & Side Income"],
  [he("מתנה|מתנות שהתקבלו|מענק"), "Gifts Received"],
  [en("gift received"), "Gifts Received"],
  [he("זיכוי|החזר|החזר כספי|ביטול עסקה"), "Refunds & Reimbursements"],
  [en("refund|reimbursement|chargeback"), "Refunds & Reimbursements"],
];

/** The category name a description almost certainly belongs to, or null when it isn't a known merchant. */
export function dictionaryCategory(description: string, kind: "expense" | "income"): string | null {
  const d = description
    .normalize("NFC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, name] of kind === "income" ? INCOME : EXPENSE) if (re.test(d)) return name;
  return null;
}

/**
 * The stable category key for a description. Renaming a category keeps its key, so the
 * dictionary keeps working after a rename. Null when no unambiguous merchant matched.
 */
export function dictionaryCategoryKey(
  description: string,
  kind: "expense" | "income",
): string | null {
  const name = dictionaryCategory(description, kind);
  return name ? categoryKeyForName(name) : null;
}

/** Every category name the dictionary can name, for the coverage test. */
export function dictionaryCategoryNames(kind: "expense" | "income"): string[] {
  return [...new Set((kind === "income" ? INCOME : EXPENSE).map(([, name]) => name))];
}

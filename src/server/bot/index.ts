import "server-only";

import { Bot } from "grammy";
import {
  handleCommand,
  splitMessage,
  menuMarkup,
  MENU_LABEL,
  MENU_PREFIX,
  BOT_COMMANDS,
  type BotConfig,
} from "./commands";
import { categorizeAction, categorizeCard, CAT_PREFIX } from "./categorize";
import { smsAction, smsCard, SMS_PREFIX } from "./sms";
import { getBotConfig, getHideAmounts, linkChat } from "./config";
import { APP_LOCKED_MESSAGE, isKeyLocked } from "../lib/encryption";

const HELP_INTRO = "לחצו ☰ תפריט למטה בכל רגע.";
import { listAllWorkspaceIds } from "../lib/workspace-context";
import { israelDay, israelToday } from "../lib/date-utils";
import { getActivitySnapshot } from "../sync/activity";
import { createUpdateNotifier, HOW_TO_UPDATE } from "../update/check";
import { currentInstall, latestUpdate, updatesEnabled } from "../update/latest";
import { redactError } from "../lib/redact";
import { getGlobalSetting, setGlobalSetting } from "../db/queries/settings";
import { digestDue, israelClock } from "@/lib/digest-schedule";

declare global {
  var __pennyBot: Bot | undefined;
  var __pennyUpdateCheck: boolean | undefined;
  var __pennyDigest: boolean | undefined;
}

// One persistent "menu" key; everything else lives in inline tabs on the card.
const KEYBOARD = { keyboard: [[{ text: MENU_LABEL }]], resize_keyboard: true, is_persistent: true };

const cmdOf = (text: string) => text.trim().split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");

// Tapping the open tab again changes nothing; Telegram reports that as an error.
const ignoreUnchanged = (err: unknown) => {
  if (!String(err).includes("message is not modified")) throw err;
};

/** Runs one command for the linked chat; null when the chat is not the owner. */
function reply(text: string, fromChatId: number, chatId: number): Promise<string | null> {
  const cfg: BotConfig = {
    chatId,
    billingDay: Number(process.env.CARD_BILLING_DAY) || 10,
    hideAmounts: getHideAmounts(),
  };
  return handleCommand(text, fromChatId, cfg, {
    workspaceId: listAllWorkspaceIds()[0],
    today: israelToday(),
    isSyncRunning: () => getActivitySnapshot().sync.active,
    runSync: async () => {
      const { runAllWorkspaces } = await import("../sync/orchestrator");
      try {
        const summaries = await runAllWorkspaces(undefined, undefined, "manual");
        const added = summaries.reduce((s, w) => s + w.added, 0);
        const failed = summaries.flatMap((w) => w.providers).filter((p) => !p.ok);
        return failed.length
          ? `⚠️ הסנכרון הסתיים עם שגיאות: ${failed.map((f) => f.label).join(", ")}`
          : `✓ הסנכרון הסתיים, ${added} עסקאות חדשות`;
      } catch (err) {
        if ((err as Error).name === "SyncBusyError")
          return "סנכרון כבר רץ עכשיו, נסו שוב בעוד רגע.";
        throw err;
      }
    },
  });
}

/** Starts long polling when a bot is saved in settings (or in env); the first chat to send the link code becomes the owner. */
export function startBot(): void {
  const { token } = getBotConfig();
  if (!token || globalThis.__pennyBot) return;
  const bot = new Bot(token);
  void bot.api.setMyCommands(BOT_COMMANDS).catch(() => undefined);

  bot.on("message:text", async (ctx) => {
    const { chatId } = getBotConfig();
    const text = ctx.message.text.trim();
    if (!chatId) {
      const code = text.match(/^\/start\s+(\S+)$/)?.[1];
      if (code && linkChat(code, ctx.chat.id))
        await ctx.reply(`מחובר ✓ ${HELP_INTRO}`, { reply_markup: KEYBOARD });
      return;
    }
    if (ctx.chat.id === chatId && isKeyLocked()) {
      await ctx.reply(APP_LOCKED_MESSAGE);
      return;
    }
    if (ctx.chat.id === chatId && !text.startsWith("/")) {
      const card = smsCard(text, israelToday());
      if (card) {
        await ctx.reply(card.text, { reply_markup: card.markup });
        return;
      }
    }
    if (ctx.chat.id === chatId && cmdOf(text) === "/categorize") {
      const ws = listAllWorkspaceIds()[0];
      if (ws === undefined) return;
      const card = categorizeCard(ws, 0, getHideAmounts());
      await ctx.reply(card.text, { parse_mode: "HTML", reply_markup: card.markup });
      return;
    }
    const out = await reply(text, ctx.chat.id, chatId);
    if (!out) return;
    const parts = splitMessage(out);
    // The reply keyboard stays put; inline tabs ride on the last part so they sit under the whole card.
    for (const [i, part] of parts.entries())
      await ctx.reply(part, {
        reply_markup: i === parts.length - 1 ? menuMarkup(cmdOf(text)) : KEYBOARD,
      });
  });

  bot.on("callback_query:data", async (ctx) => {
    const { chatId } = getBotConfig();
    const data = ctx.callbackQuery.data;
    // Same owner check as messages: a forwarded card must not work in another chat.
    if (!chatId || ctx.chat?.id !== chatId) return ctx.answerCallbackQuery();
    if (isKeyLocked())
      return ctx.answerCallbackQuery({ text: APP_LOCKED_MESSAGE, show_alert: true });
    if (data.startsWith(CAT_PREFIX)) {
      const ws = listAllWorkspaceIds()[0];
      const card = ws === undefined ? null : categorizeAction(ws, data, getHideAmounts());
      await ctx.answerCallbackQuery();
      if (card)
        await ctx
          .editMessageText(card.text, { parse_mode: "HTML", reply_markup: card.markup })
          .catch(ignoreUnchanged);
      return;
    }
    if (data.startsWith(SMS_PREFIX)) {
      const ws = listAllWorkspaceIds()[0];
      await ctx.answerCallbackQuery();
      if (ws !== undefined) await ctx.editMessageText(smsAction(ws, data)).catch(ignoreUnchanged);
      return;
    }
    if (!data.startsWith(MENU_PREFIX)) return ctx.answerCallbackQuery();
    const cmd = data.slice(MENU_PREFIX.length);
    await ctx.answerCallbackQuery(cmd === "/sync" ? { text: "מסנכרן…" } : undefined);
    const edit = (text: string) =>
      ctx.editMessageText(text, { reply_markup: menuMarkup(cmd) }).catch(ignoreUnchanged);
    if (cmd === "/sync") await edit("⟳ מסנכרן…");
    const out = await reply(cmd, chatId, chatId);
    if (out) await edit(splitMessage(out)[0]);
  });

  bot.catch((err) => console.error("[bot]", redactError(err)));
  globalThis.__pennyBot = bot;
  void bot.start();
  if (!globalThis.__pennyUpdateCheck) {
    globalThis.__pennyUpdateCheck = true;
    scheduleUpdateCheck((text) => {
      const { chatId } = getBotConfig();
      const current = globalThis.__pennyBot;
      return chatId && current
        ? current.api.sendMessage(chatId, text).then(() => undefined)
        : Promise.resolve();
    });
  }
  if (!globalThis.__pennyDigest) {
    globalThis.__pennyDigest = true;
    setInterval(() => {
      void sendDigest().catch((err) => console.error("[digest]", redactError(err)));
      void sendBillReminders().catch((err) => console.error("[bills]", redactError(err)));
    }, 15 * 60_000).unref();
  }
}

const DIGEST_SENT = "telegram_digest_sent";
const BILLS_SENT = "telegram_bill_reminders_sent";

/** Bills due within the reminder window, each sent once; amounts follow the "hide amounts" switch. */
async function sendBillReminders(): Promise<void> {
  const { chatId } = getBotConfig();
  const bot = globalThis.__pennyBot;
  const ws = listAllWorkspaceIds()[0];
  if (!bot || !chatId || ws === undefined || isKeyLocked()) return;
  const [{ billReminders }, { pendingToSend }] = await Promise.all([
    import("../insights/bill-reminders"),
    import("@/lib/bill-reminders"),
  ]);
  let sent: string[] = [];
  try {
    const raw: unknown = JSON.parse(getGlobalSetting(BILLS_SENT) ?? "[]");
    if (Array.isArray(raw)) sent = raw.filter((k): k is string => typeof k === "string");
  } catch {
    // Unreadable stored value: start from the default.
  }
  const { send, keep } = pendingToSend(billReminders(ws, israelToday()), sent);
  // Remember first: a failed send is not retried every 15 minutes into a flood.
  setGlobalSetting(BILLS_SENT, JSON.stringify(keep));
  if (!send.length) return;
  const hide = getHideAmounts();
  const when = (d: number) => (d === 0 ? "היום" : d === 1 ? "מחר" : `בעוד ${d} ימים`);
  const lines = send.map(
    (b) =>
      `• ${b.name}${hide ? "" : ` · ₪${Math.round(b.amount).toLocaleString("he-IL")}`} · ${when(b.daysLeft)}`,
  );
  await bot.api.sendMessage(chatId, `🔔 חיובים קרובים\n\n${lines.join("\n")}`);
}

/** Sunday, Tuesday and Thursday mornings: the full snapshot, unasked. Remembers the day so a restart doesn't resend it. */
async function sendDigest(): Promise<void> {
  const { chatId } = getBotConfig();
  const bot = globalThis.__pennyBot;
  if (!bot || !chatId || isKeyLocked() || !digestDue(new Date(), getGlobalSetting(DIGEST_SENT)))
    return;
  setGlobalSetting(DIGEST_SENT, israelClock(new Date()).date);
  const out = await reply("/full", chatId, chatId);
  if (!out) return;
  const parts = splitMessage(`🗓️ סיכום ביניים\n\n${out}`);
  for (const [i, part] of parts.entries())
    await bot.api.sendMessage(
      chatId,
      part,
      i === parts.length - 1 ? { reply_markup: menuMarkup() } : undefined,
    );
}

/** Right after a sync: tells the linked chat about new expenses, in context. Silent when locked or nothing new. */
export async function sendSpendFeedback(since: string): Promise<void> {
  const { chatId } = getBotConfig();
  const bot = globalThis.__pennyBot;
  const ws = listAllWorkspaceIds()[0];
  if (!bot || !chatId || ws === undefined || isKeyLocked()) return;
  const { spendFeedback } = await import("./feedback");
  const text = spendFeedback(ws, since, israelToday(), getHideAmounts());
  if (!text) return;
  const parts = splitMessage(text);
  for (const [i, part] of parts.entries())
    await bot.api.sendMessage(
      chatId,
      part,
      i === parts.length - 1 ? { reply_markup: menuMarkup() } : undefined,
    );
}

/** After a scheduled sync: tells the user when a bank connection starts failing, stays down, or recovers. */
export async function sendSyncAlerts(
  results: {
    label: string;
    provider: string;
    ok: boolean;
    errorMessage?: string;
    credentialId: number;
    syncRunId?: number;
  }[],
): Promise<void> {
  const { chatId } = getBotConfig();
  const bot = globalThis.__pennyBot;
  if (!bot || !chatId || isKeyLocked()) return;
  const [{ getDb }, { syncAlert }, { parseSyncError }, he] = await Promise.all([
    import("../db"),
    import("@/lib/sync-alert"),
    import("@/lib/sync-errors"),
    import("@/i18n/messages/he.json"),
  ]);
  // The last finished run before this one; a run that never got created (credentials missing) compares with the latest.
  const prevStmt = getDb().prepare(
    "SELECT status FROM sync_runs WHERE credential_id = ? AND id < ? AND status != 'running' ORDER BY id DESC LIMIT 1",
  );
  // The failing streak: every failed run since the last successful one. Counted in days below, because
  // the scheduler retries a transient failure several times a day.
  const lastOkStmt = getDb().prepare(
    "SELECT id, completed_at AS at FROM sync_runs WHERE credential_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1",
  );
  const failedStmt = getDb().prepare(
    "SELECT id, started_at AS at FROM sync_runs WHERE credential_id = ? AND status = 'failed' AND id > ?",
  );
  // SQLite stores UTC as "YYYY-MM-DD HH:MM:SS".
  const day = (at: string) => israelDay(`${at.replace(" ", "T")}Z`);
  const today = israelToday();
  const errors = he.default.syncErrors as Record<string, string>;
  const text = syncAlert(
    results.map((r) => {
      const lastOk = lastOkStmt.get(r.credentialId) as
        { id: number; at: string | null } | undefined;
      const earlier = r.ok
        ? []
        : (failedStmt.all(r.credentialId, lastOk?.id ?? 0) as { id: number; at: string }[])
            .filter((f) => f.id !== r.syncRunId)
            .map((f) => day(f.at));
      return {
        label: r.label || r.provider,
        ok: r.ok,
        wasFailing:
          (
            prevStmt.get(r.credentialId, r.syncRunId ?? Number.MAX_SAFE_INTEGER) as
              { status: string } | undefined
          )?.status === "failed",
        reason: r.errorMessage
          ? errors[parseSyncError(r.errorMessage).key ?? "unknown"]
          : undefined,
        failedDays: new Set([...earlier, today]).size,
        failedEarlierToday: earlier.includes(today),
        lastOk: lastOk?.at ? day(lastOk.at) : null,
      };
    }),
  );
  if (text) await bot.api.sendMessage(chatId, text);
}

/** Sends a Pip briefing to the linked Telegram chat. Silent when the bot is off or the app is locked. */
export async function sendPipBriefing(workspaceId: number, text: string): Promise<void> {
  const { chatId } = getBotConfig();
  const bot = globalThis.__pennyBot;
  if (!bot || !chatId || isKeyLocked() || !text) return;
  if (workspaceId <= 0) return;
  const parts = splitMessage(text);
  for (const part of parts) await bot.api.sendMessage(chatId, part);
}

/** Called after the bot is saved or removed in settings. */
export async function restartBot(): Promise<void> {
  const old = globalThis.__pennyBot;
  globalThis.__pennyBot = undefined;
  if (old) await old.stop().catch(() => undefined);
  startBot();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tells the user in Telegram once per new release (the app also shows a banner). Off with PENNY_UPDATE_CHECK=0. Never installs anything. */
function scheduleUpdateCheck(send: (text: string) => Promise<void>): void {
  if (!updatesEnabled()) return;
  const notify = createUpdateNotifier(send, HOW_TO_UPDATE[currentInstall()]);
  const run = async () => {
    const info = await latestUpdate();
    if (info) await notify(info).catch((err) => console.error("[update]", redactError(err)));
  };
  setTimeout(() => void run(), 60_000).unref();
  setInterval(() => void run(), DAY_MS).unref();
}

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigrations } from "@/server/db/migrate";
import { seedProfiles } from "@/server/db/profiles-migration";

function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "penny-profmig-"));
  const db = new Database(path.join(dir, "penny.db"));
  runMigrations(db);
  return { db, dir };
}
const count = (db: Database.Database, sql: string, ...a: unknown[]) =>
  (db.prepare(sql).get(...a) as { n: number }).n;

describe("profiles migration", () => {
  it("makes empty workspaces profiles of the main household and keeps ones with data hidden and intact", () => {
    const { db } = freshDb();
    db.exec("DELETE FROM profiles");
    db.prepare("UPDATE workspaces SET name='Main', avatar_emoji=NULL WHERE id=1").run();
    db.prepare(
      "INSERT INTO workspaces (id, name, slug, avatar_emoji) VALUES (2, 'Empty', 'empty', '@alien'), (3, 'Full', 'full', NULL)",
    ).run();
    db.prepare(
      "INSERT INTO categories (workspace_id, name, color, icon) VALUES (2, 'Seeded', '#000', 'x')",
    ).run();
    db.prepare(
      "INSERT INTO excluded_merchants (workspace_id, provider, merchant_key) VALUES (3, 'max', 'a'), (3, 'max', 'b')",
    ).run();
    db.prepare(
      "INSERT INTO synced_preferences (workspace_id, profile, key, value) VALUES (2, 'local', 'studio', '{\"accent\":\"rose\"}')",
    ).run();

    const report = seedProfiles(db)!;
    expect(report.household).toBe(1);
    expect(report.profiles.map((p) => p.workspaceId)).toEqual([1, 2]);
    expect(report.keptHidden).toEqual([
      { workspaceId: 3, name: "Full", rows: { excluded_merchants: 2 } },
    ]);
    const profiles = db
      .prepare("SELECT workspace_id, name, avatar_emoji FROM profiles ORDER BY id")
      .all();
    expect(profiles).toEqual([
      { workspace_id: 1, name: "Main", avatar_emoji: "@fox" },
      { workspace_id: 1, name: "Empty", avatar_emoji: "@alien" },
    ]);
    const alien = report.profiles[1].profileId;
    expect(
      db
        .prepare("SELECT value FROM synced_preferences WHERE workspace_id=1 AND profile=?")
        .get(`p${alien}`),
    ).toEqual({ value: '{"accent":"rose"}' });
    // Nothing deleted anywhere.
    expect(count(db, "SELECT COUNT(*) AS n FROM workspaces")).toBe(3);
    expect(count(db, "SELECT COUNT(*) AS n FROM excluded_merchants WHERE workspace_id=3")).toBe(2);
    expect(count(db, "SELECT COUNT(*) AS n FROM synced_preferences WHERE workspace_id=2")).toBe(1);
    // Idempotent.
    expect(seedProfiles(db)).toBeNull();
    expect(count(db, "SELECT COUNT(*) AS n FROM profiles")).toBe(2);
  }, 180_000);

  it("backs up an existing install once, before seeding", () => {
    const { db, dir } = freshDb();
    expect(fs.readdirSync(dir).some((f) => f.endsWith(".bak"))).toBe(false); // fresh install: nothing to back up
    db.exec("DELETE FROM profiles; DELETE FROM _migrations WHERE name='046_profiles.sql'");
    runMigrations(db);
    const baks = fs.readdirSync(dir).filter((f) => f.endsWith(".before-profiles.bak"));
    expect(baks).toHaveLength(1);
    const bak = new Database(path.join(dir, baks[0]), { readonly: true });
    expect(count(bak, "SELECT COUNT(*) AS n FROM profiles")).toBe(0);
    bak.close();
    expect(count(db, "SELECT COUNT(*) AS n FROM profiles")).toBe(1);
    expect(fs.existsSync(path.join(dir, "profiles-migration-report.json"))).toBe(true);
    runMigrations(db);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".bak"))).toHaveLength(1);
  }, 180_000);
});

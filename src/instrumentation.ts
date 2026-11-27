export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installProcessHandlers, runEach } = await import("@/server/lib/startup");
  installProcessHandlers();
  await runEach({
    keyFile: async () => (await import("@/server/lib/encryption")).checkKeyFileAtStartup(),
    scheduler: async () => (await import("@/server/sync/scheduler")).initScheduler(),
    jobWorker: async () => {
      const { registerAllJobHandlers } = await import("@/server/jobs/handlers");
      registerAllJobHandlers();
      const { initJobWorker } = await import("@/server/jobs/worker");
      initJobWorker();
      const { initBackendSchedules } = await import("@/server/jobs/schedule");
      initBackendSchedules();
    },
    legacyExport: async () =>
      (await import("@/server/lib/legacy-export")).initLegacyExportSchedule(),
    folderImport: async () =>
      (await import("@/server/lib/folder-import")).initFolderImportSchedule(),
    autoBackup: async () => (await import("@/server/lib/auto-backup")).initAutoBackupSchedule(),
    bot: async () => (await import("@/server/bot")).startBot(),
  });
}

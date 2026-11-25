"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  markProfileChosen,
  useProfiles,
  useSwitchProfile,
} from "@/components/layout/workspace-switcher";
import { deleteProfile, saveProfile } from "@/lib/api";
import { profileName } from "@/lib/profile-avatar";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { AvatarEditor, type AvatarDraft } from "./avatar-editor";
import { ProfileAvatar } from "./profile-avatar";

// "Who's using?": the app's own canvas, light and glass pane, in whichever theme is on.
const tile =
  "press group flex min-h-11 w-28 flex-col items-center gap-3 rounded-3xl p-3 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-36";
const square =
  "size-20 sm:size-24 ring-0 ring-offset-4 ring-offset-transparent motion-safe:transition motion-safe:duration-150 group-hover:ring-2 group-hover:ring-[var(--accent-color)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent-color)]";

type Draft = { id: number | null; name: string; avatar: AvatarDraft };

export function ProfilesPage() {
  const t = useTranslations("profiles");
  const nameOf = (p: Profile) => profileName(p.name, t("me"));
  const router = useRouter();
  const qc = useQueryClient();
  const switchProfile = useSwitchProfile();
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { profiles, activeId } = useProfiles();

  const choose = (p: Profile) => {
    markProfileChosen();
    switchProfile(p);
    router.push("/");
  };

  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : t("error"));

  const save = useMutation({
    mutationFn: (d: Draft) =>
      saveProfile(d.id, d.name, { avatarColor: d.avatar.color, avatarPhoto: d.avatar.photo }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["profiles"] });
      void qc.invalidateQueries({ queryKey: ["settings"] });
      setDraft(null);
    },
    onError,
  });

  const remove = useMutation({
    // Removes the profile and its preferences only; the household's data stays.
    mutationFn: (id: number) => deleteProfile(id),
    onSuccess: (_r, id) => {
      const next = profiles.find((p) => p.id !== id);
      if (id === activeId && next) switchProfile(next);
      void qc.invalidateQueries({ queryKey: ["profiles"] });
      setDraft(null);
    },
    onError,
  });

  const openEditor = (p?: Profile) => {
    setConfirmDelete(false);
    setDraft(
      p
        ? { id: p.id, name: nameOf(p), avatar: { color: p.avatarColor, photo: p.avatarPhoto } }
        : { id: null, name: "", avatar: { color: null, photo: null } },
    );
  };

  return (
    <main className="profiles-screen fixed inset-0 z-40 flex flex-col items-center justify-center overflow-y-auto px-4 py-12 text-foreground">
      {/* The brand lives here only; inside the app the sidebar stays free of it. */}
      <p
        className="absolute top-6 flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground"
        lang="en"
        dir="ltr"
      >
        <span
          className="flex size-7 items-center justify-center gap-1 rounded-[9px] bg-primary"
          aria-hidden
        >
          <i className="h-2.5 w-1 rounded-full bg-primary-foreground" />
          <i className="h-2.5 w-1 rounded-full bg-primary-foreground" />
        </span>
        Penny
      </p>
      <section className="home-hero w-full max-w-xl px-5 pb-6 pt-8 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {managing ? t("manageTitle") : t("title")}
        </h1>

        <ul className="mt-7 flex flex-wrap justify-center gap-2 sm:gap-4">
          {profiles.map((p, i) => (
            <li
              key={p.id}
              className="motion-safe:animate-[fadeIn_0.45s_ease-out_both]"
              style={{ animationDelay: `${120 + i * 70}ms` }}
            >
              <button
                type="button"
                className={tile}
                onClick={() => (managing ? openEditor(p) : choose(p))}
                aria-label={managing ? t("editProfile", { name: nameOf(p) }) : nameOf(p)}
              >
                <span className="relative">
                  <ProfileAvatar profile={p} className={cn(square, managing && "brightness-50")} />
                  {managing ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex size-10 items-center justify-center rounded-full bg-black/55">
                        <Pencil className="size-5 text-white" />
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate text-[15px] font-medium">{nameOf(p)}</span>
              </button>
            </li>
          ))}
          <li
            className="motion-safe:animate-[fadeIn_0.45s_ease-out_both]"
            style={{ animationDelay: `${120 + profiles.length * 70}ms` }}
          >
            <button type="button" className={tile} onClick={() => openEditor()}>
              <span
                className={cn(
                  square,
                  "flex items-center justify-center rounded-full border border-dashed border-interactive text-muted-foreground group-hover:text-foreground",
                )}
              >
                <Plus className="size-7" />
              </span>
              <span className="text-[15px] font-medium text-muted-foreground group-hover:text-foreground">
                {t("add")}
              </span>
            </button>
          </li>
        </ul>

        <Button
          variant="outline"
          size="lg"
          className={cn("mt-6 px-6", managing && "border-primary bg-selection text-strong")}
          aria-pressed={managing}
          onClick={() => setManaging((m) => !m)}
        >
          {managing ? t("done") : t("manage")}
        </Button>
      </section>

      <Dialog open={draft != null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {draft ? (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.name.trim()) save.mutate(draft);
              }}
            >
              <DialogHeader>
                <DialogTitle>{draft.id == null ? t("add") : t("edit")}</DialogTitle>
              </DialogHeader>

              <AvatarEditor
                id={draft.id ?? profiles.length + 1}
                name={draft.name}
                value={draft.avatar}
                onChange={(avatar) => setDraft({ ...draft, avatar })}
              />

              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t("name")}
                <Input
                  autoFocus
                  required
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-11"
                />
              </label>

              {confirmDelete ? (
                <p role="alert" className="text-sm text-muted-foreground">
                  {t("deleteWarning")}
                </p>
              ) : null}

              <DialogFooter className="gap-2 sm:justify-between">
                {/* Never offer deleting the last profile; the server refuses it too. */}
                {draft.id != null && profiles.length > 1 ? (
                  confirmDelete ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="lg"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(draft.id!)}
                    >
                      {t("confirmDelete")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      className="text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      {t("delete")}
                    </Button>
                  )
                ) : (
                  <span />
                )}
                <Button type="submit" size="lg" disabled={!draft.name.trim() || save.isPending}>
                  {t("save")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}

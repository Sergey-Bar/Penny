"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  busy: boolean;
  labels: {
    title: string;
    drop: string;
    hint: string;
    paste: string;
    pastePlaceholder: string;
    continue: string;
    reading: string;
    pdf: string;
    change: string;
  };
  onFile: (file: File) => void;
  onDocument?: (file: File) => void;
  onPaste: (text: string) => void;
}

/** Upload or paste. Both paths end in the same editable grid. */
export function SourcePicker({ busy, labels, onFile, onPaste, onDocument }: Props) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = (file: File) => {
    if (onDocument && (file.type.startsWith("image/") || /\.pdf$/i.test(file.name)))
      onDocument(file);
    else onFile(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-full bg-muted/40 p-1 text-footnote">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`flex-1 rounded-full px-3 py-1.5 ${mode === "file" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
        >
          <FileUp className="me-1 inline size-3.5" aria-hidden />
          {labels.title}
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`flex-1 rounded-full px-3 py-1.5 ${mode === "paste" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
        >
          <ClipboardPaste className="me-1 inline size-3.5" aria-hidden />
          {labels.paste}
        </button>
      </div>

      {mode === "file" ? (
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) pick(file);
          }}
          className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "bg-muted/20 hover:bg-muted/40"
          }`}
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <Upload className="size-6 text-muted-foreground" aria-hidden />
          )}
          <span className="text-sm font-medium">{busy ? labels.reading : labels.drop}</span>
          <span className="text-caption text-muted-foreground">{labels.hint}</span>
          <input
            ref={input}
            id="statement-file"
            type="file"
            accept=".csv,.txt,.tsv,.xlsx,.xls,.html,.htm,.pdf,image/*,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) pick(file);
              if (input.current) input.current.value = "";
            }}
          />
        </label>
      ) : (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={labels.pastePlaceholder}
            className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-footnote outline-none focus-visible:ring-2 focus-visible:ring-ring"
            dir="ltr"
          ></textarea>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={busy || text.trim().length < 3}
              onClick={() => onPaste(text)}
            >
              {labels.continue}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// src/components/files/FileDropzone.tsx
import { useRef, useState } from "react";

type Props = {
  accept?: string;            // e.g. ".csv,text/csv"
  onFile: (file: File) => void;
  label?: string;             // visible label above
  help?: string;              // small text below
};

export default function FileDropzone({ accept, onFile, label = "CSV file", help }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="text-sm">
      {label && <div className="mb-1">{label}</div>}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 cursor-pointer
          ${dragOver ? "border-sc-green bg-sc-lightgreen/10" : "border-sc-delft/25 hover:bg-gray-50"}`}
        aria-label="Upload file. Drag and drop or browse"
      >
        <div className="font-medium">Drag & drop your CSV here</div>
        <div className="text-xs text-sc-delft/70 mt-1">or click to <span className="underline">browse</span></div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {help && <div className="mt-1 text-xs text-sc-delft/60">{help}</div>}
    </div>
  );
}

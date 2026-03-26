import { AlertTriangle, FileSpreadsheet, UploadCloud } from "lucide-react";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

import { LoadingSpinner } from "../common/LoadingSpinner";

const acceptedFormats = {
  "text/csv": [".csv"],
  "text/plain": [".txt", ".dat", ".tsv"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

interface FileUploaderProps {
  disabled?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  error?: string | null;
  onUpload: (file: File) => Promise<void>;
}

export function FileUploader({ disabled = false, isUploading = false, uploadProgress = 0, error = null, onUpload }: FileUploaderProps) {
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const [file] = acceptedFiles;
      if (!file || disabled || isUploading) {
        return;
      }

      await onUpload(file);
    },
    [disabled, isUploading, onUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: disabled || isUploading,
    accept: acceptedFormats,
  });

  return (
    <section className="panel-surface p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-teal-500">Step 1</p>
          <h2 className="mt-3 text-2xl font-semibold text-ink-900">Drop a logger export or spreadsheet</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">
            Upload CSV, TXT, DAT, XLS, or XLSX input files. The backend will parse the file, detect a timestamp index,
            and infer measurement metadata for each column.
          </p>
        </div>
        <div className="panel-muted hidden items-center gap-3 px-4 py-3 text-sm text-ink-700 lg:flex">
          <FileSpreadsheet className="h-4 w-4 text-ember-500" />
          <span>CSV, Excel, NRG, Campbell</span>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={[
          "mt-8 rounded-[2rem] border border-dashed px-6 py-14 text-center transition",
          disabled ? "cursor-not-allowed border-ink-200 bg-ink-50/60 opacity-70" : "cursor-pointer",
          isDragActive ? "border-teal-500 bg-teal-50/80" : "border-ink-200 bg-white/70 hover:border-ember-300 hover:bg-ember-50/30",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <div className="mx-auto flex max-w-lg flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-900 text-white shadow-panel">
            {isUploading ? <LoadingSpinner label="Uploading" /> : <UploadCloud className="h-7 w-7" />}
          </div>
          <h3 className="mt-5 text-xl font-semibold text-ink-900">
            {isDragActive ? "Drop the file to start parsing" : "Drag and drop a file here"}
          </h3>
          <p className="mt-3 text-sm leading-7 text-ink-600">
            Or click to browse. The first pass returns the first 20 rows, detected column types, and inferred time step.
          </p>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.26em] text-ink-500">
            Accepted: .csv .txt .tsv .dat .xls .xlsx
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {isUploading ? (
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm text-ink-600">
            <span>Uploading and parsing</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-teal-500 transition-[width] duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

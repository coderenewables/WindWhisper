import { create } from "zustand";

import { confirmDatasetImport, uploadDatasetPreview } from "../api/datasets";
import type { ColumnInfo, DatasetImportResponse, UploadPreviewResponse } from "../types/dataset";

interface DatasetState {
  uploadPreview: UploadPreviewResponse | null;
  selectedProjectId: string | null;
  lastImportedDataset: DatasetImportResponse | null;
  isUploading: boolean;
  uploadProgress: number;
  isConfirming: boolean;
  error: string | null;
  setSelectedProject: (projectId: string | null) => void;
  uploadFile: (projectId: string, file: File, sheetName?: string) => Promise<UploadPreviewResponse>;
  updateColumns: (columns: ColumnInfo[]) => void;
  clearUploadPreview: () => void;
  confirmImport: (projectId: string, datasetName: string | null, columns: ColumnInfo[]) => Promise<DatasetImportResponse>;
  clearError: () => void;
}

export const useDatasetStore = create<DatasetState>((set, get) => ({
  uploadPreview: null,
  selectedProjectId: null,
  lastImportedDataset: null,
  isUploading: false,
  uploadProgress: 0,
  isConfirming: false,
  error: null,
  setSelectedProject: (projectId) => set({ selectedProjectId: projectId }),
  uploadFile: async (projectId, file, sheetName) => {
    set({
      isUploading: true,
      uploadProgress: 0,
      error: null,
      uploadPreview: null,
      lastImportedDataset: null,
      selectedProjectId: projectId,
    });
    try {
      const preview = await uploadDatasetPreview({
        projectId,
        file,
        sheetName,
        onUploadProgress: (progress) => set({ uploadProgress: progress }),
      });
      set({ uploadPreview: preview, isUploading: false, uploadProgress: 100 });
      return preview;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload file";
      set({ error: message, isUploading: false, uploadProgress: 0 });
      throw new Error(message);
    }
  },
  updateColumns: (columns) => {
    const preview = get().uploadPreview;
    if (!preview) {
      return;
    }
    set({ uploadPreview: { ...preview, columns } });
  },
  clearUploadPreview: () => set({ uploadPreview: null, error: null, uploadProgress: 0 }),
  confirmImport: async (projectId, datasetName, columns) => {
    const preview = get().uploadPreview;
    if (!preview) {
      throw new Error("No import preview is available to confirm");
    }

    set({ isConfirming: true, error: null, selectedProjectId: projectId });
    try {
      const importedDataset = await confirmDatasetImport(projectId, {
        import_id: preview.import_id,
        dataset_name: datasetName || undefined,
        columns,
      });
      set({
        isConfirming: false,
        lastImportedDataset: importedDataset,
        uploadPreview: null,
      });
      return importedDataset;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to confirm import";
      set({ error: message, isConfirming: false });
      throw new Error(message);
    }
  },
  clearError: () => set({ error: null }),
}));

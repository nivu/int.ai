"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  accept: string;
  maxSize?: number;
  label: string;
  bucket: string;
  path?: string;
  onFileSelect?: (file: File) => void;
  onUpload?: (storagePath: string) => void;
}

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
  accept,
  maxSize = DEFAULT_MAX_SIZE,
  label,
  bucket,
  path = "",
  onFileSelect,
  onUpload,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState(false);

  const allowedExtensions = accept
    .split(",")
    .map((ext) => ext.trim().toLowerCase());

  const validateFile = useCallback(
    (file: File): string | null => {
      const fileName = file.name.toLowerCase();
      const hasValidExtension = allowedExtensions.some((ext) =>
        fileName.endsWith(ext)
      );
      if (!hasValidExtension) {
        return `Invalid file type. Accepted: ${accept}`;
      }
      if (file.size > maxSize) {
        return `File too large. Maximum size: ${formatFileSize(maxSize)}`;
      }
      return null;
    },
    [allowedExtensions, accept, maxSize]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setProgress(0);
      setError(null);

      const supabase = createClient();
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = path
        ? `${path}/${timestamp}_${safeName}`
        : `${timestamp}_${safeName}`;

      // Simulate progress since Supabase JS client doesn't expose upload progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 15, 90));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      clearInterval(progressInterval);

      if (uploadError) {
        setProgress(0);
        setUploading(false);
        setError(`Upload failed: ${uploadError.message}`);
        return;
      }

      setProgress(100);
      setUploading(false);
      setUploaded(true);
      onUpload?.(storagePath);
    },
    [bucket, path, onUpload]
  );

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      setUploaded(false);

      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      onFileSelect?.(file);
      uploadFile(file);
    },
    [validateFile, onFileSelect, uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so re-selecting the same file triggers change
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFile]
  );

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none">{label}</label>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          error && "border-destructive/50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        {selectedFile ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(selectedFile.size)}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Drag and drop a file here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground/70">
              Accepted: {accept} (max {formatFileSize(maxSize)})
            </p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {uploading && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {uploaded && !uploading && (
        <p className="text-xs text-green-600 dark:text-green-400">
          File uploaded successfully
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

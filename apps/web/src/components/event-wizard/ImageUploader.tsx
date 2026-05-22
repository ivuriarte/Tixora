'use client';

import { useCallback, useId, useRef, useState, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface ImageUploaderProps {
  /** Currently uploaded image URL (empty string when none) */
  value: string;
  /** Called with the new image URL after a successful upload, or '' when removed */
  onChange: (url: string) => void;
  /** API path to POST the multipart form to (must return `{ data: { url } }`) */
  endpoint: string;
  /** Accepted MIME types — also used for the file picker's `accept` attribute */
  accept?: string;
  /** Hard client-side cap. Server enforces its own limit independently. */
  maxSizeMB?: number;
  /** Aspect ratio hint shown on the dropzone */
  hint?: string;
  /** Aspect ratio class for the preview box (e.g. 'aspect-[1200/630]') */
  previewAspect?: string;
  /** Visual size — affects label sizing */
  variant?: 'cover' | 'logo';
}

const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp';

export default function ImageUploader({
  value,
  onChange,
  endpoint,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = 5,
  hint,
  previewAspect = 'aspect-[1200/630]',
  variant = 'cover',
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const acceptList = accept.split(',').map((s) => s.trim());

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!acceptList.includes(file.type)) {
        return `Unsupported file type. Allowed: ${acceptList.map((m) => m.replace('image/', '').toUpperCase()).join(', ')}.`;
      }
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > maxSizeMB) {
        return `File is too large (${sizeMB.toFixed(1)} MB). Maximum: ${maxSizeMB} MB.`;
      }
      return null;
    },
    [acceptList, maxSizeMB],
  );

  const upload = useCallback(
    async (file: File) => {
      const err = validateFile(file);
      if (err) {
        toast.error(err);
        return;
      }
      setUploading(true);
      setProgress(0);
      try {
        const fd = new FormData();
        fd.append('image', file);
        const res = await api.post<{ data: { url: string } }>(endpoint, fd, {
          onUploadProgress: (e) => {
            if (e.total) setProgress(Math.round((e.loaded * 100) / e.total));
          },
        });
        onChange(res.data.data.url);
        toast.success('Image uploaded');
      } catch (e: unknown) {
        const err = e as {
          response?: { status?: number; statusText?: string; data?: { message?: string | string[] } };
          request?: unknown;
          message?: string;
          code?: string;
        };
        let message = 'Upload failed';
        if (err.response) {
          // Server responded with a non-2xx status
          const status = err.response.status;
          const raw = err.response.data?.message;
          const serverMsg = Array.isArray(raw) ? raw.join(', ') : raw;
          if (serverMsg) {
            message = serverMsg;
          } else if (status === 401 || status === 403) {
            message = 'You are not authorized to upload. Please log in again.';
          } else if (status === 404) {
            message = `Upload endpoint not found (${endpoint}). Try again shortly — the API may be redeploying.`;
          } else if (status === 413) {
            message = `File is too large for the server (limit ${maxSizeMB} MB).`;
          } else if (status === 415) {
            message = 'Unsupported file type.';
          } else if (status && status >= 500) {
            message = `Server error (${status}). Please try again.`;
          } else {
            message = `Upload failed (HTTP ${status ?? '?'}).`;
          }
        } else if (err.code === 'ECONNABORTED') {
          message = 'Upload timed out. Check your connection and try a smaller file.';
        } else if (err.request) {
          message = 'No response from server. Check your internet connection.';
        } else if (err.message) {
          message = err.message;
        }
        toast.error(message, { duration: 6000 });
      } finally {
        setUploading(false);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [endpoint, onChange, validateFile],
  );

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function remove() {
    onChange('');
  }

  // ─── Preview state (image already uploaded) ─────────────────────────────
  if (value) {
    return (
      <div className="space-y-2">
        <div
          className={`relative w-full ${previewAspect} overflow-hidden rounded-xl border border-gray-200 bg-gray-50 ${variant === 'logo' ? 'max-w-[140px]' : ''}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Uploaded preview" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-sm text-primary hover:underline font-medium"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={remove}
            className="text-sm text-red-500 hover:text-red-700 font-medium"
          >
            Remove
          </button>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
    );
  }

  // ─── Empty / drop-zone state ────────────────────────────────────────────
  const borderCls = dragOver
    ? 'border-primary bg-primary/5'
    : uploading
      ? 'border-primary/50 bg-primary/5'
      : 'border-gray-300 hover:border-primary/50 hover:bg-gray-50';

  return (
    <label
      htmlFor={inputId}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`block cursor-pointer rounded-xl border-2 border-dashed ${borderCls} transition-colors px-6 py-8 text-center ${variant === 'logo' ? 'max-w-[280px]' : ''}`}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {uploading ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Uploading… {progress}%</p>
          <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <svg className="w-8 h-8 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5v9" />
          </svg>
          <p className="text-sm font-medium text-gray-700">
            <span className="text-primary">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-400">
            {acceptList.map((m) => m.replace('image/', '').toUpperCase()).join(', ')} · up to {maxSizeMB} MB
            {hint && <span> · {hint}</span>}
          </p>
        </div>
      )}
    </label>
  );
}

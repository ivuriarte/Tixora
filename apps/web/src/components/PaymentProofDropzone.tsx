'use client';

import { useCallback, useRef, useState } from 'react';
import api from '@/lib/api';

interface Props {
  registrationId: string;
  guestAccessToken?: string;
  /** Called with the uploaded proof's image URL on success. */
  onUploaded: (imageUrl: string) => void;
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_LABEL = '5 MB';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PaymentProofDropzone({ registrationId, guestAccessToken, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback((f: File | null | undefined) => {
    setError(null);
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (!ALLOWED.includes(f.type)) {
      setError('Only JPG, PNG, or WEBP images are allowed.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`File is larger than ${MAX_LABEL}.`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    acceptFile(e.target.files?.[0]);

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('registrationId', registrationId);
      const res = await api.post(guestAccessToken ? '/payment-proofs/guest' : '/payment-proofs', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(guestAccessToken && { 'x-registration-token': guestAccessToken }),
        },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded * 100) / e.total));
        },
      });
      const body = res.data?.data ?? res.data;
      onUploaded(body?.imageUrl ?? '');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string | string[] } } };
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Upload failed. Try again.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragOver
            ? 'border-primary bg-primary/5'
            : preview
              ? 'border-gray-200 bg-gray-50'
              : 'border-gray-300 bg-white hover:bg-gray-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
          className="sr-only"
          aria-label="Upload payment proof image"
        />

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: URL from local file picker; next/image does not support blob: scheme
          <img
            src={preview}
            alt="Payment proof preview"
            loading="lazy"
            decoding="async"
            className="max-h-64 w-auto rounded-lg shadow-sm object-contain"
          />
        ) : (
          <>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 16a4 4 0 01-.88-7.9 5 5 0 019.9-1.05A4.5 4.5 0 0117 16h-1m-5-2v6m0-6l-2 2m2-2l2 2"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">
              Drag &amp; drop your screenshot here
            </p>
            <p className="text-xs text-gray-500 mt-1">
              or <span className="text-primary font-medium">browse</span> to choose a file
            </p>
            <p className="text-[11px] text-gray-400 mt-2">JPG, PNG, or WEBP · Max {MAX_LABEL}</p>
          </>
        )}
      </label>

      {file && (
        <div className="flex items-center justify-between rounded-lg border border-[#e4dcf4] bg-white px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-500">
              {formatBytes(file.size)} · {file.type.split('/')[1].toUpperCase()}
            </p>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={uploading}
            className="ml-3 min-h-[44px] px-3 text-xs font-bold text-[#756a92] hover:text-red-600 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}

      {uploading && (
        <div className="w-full">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Uploading… {progress}%</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={upload}
        disabled={!file || uploading}
        className="axon-pill w-full bg-primary text-sm text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : 'Upload payment proof'}
      </button>

      <p className="text-[11px] text-gray-500 leading-relaxed">
        Make sure the <span className="font-medium text-gray-700">reference number</span> and the{' '}
        <span className="font-medium text-gray-700">exact amount</span> are clearly visible in the
        screenshot. Blurred or cropped images may be rejected.
      </p>
    </div>
  );
}

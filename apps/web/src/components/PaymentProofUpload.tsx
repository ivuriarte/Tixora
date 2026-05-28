'use client';

import { useState, useRef } from 'react';
import api from '@/lib/api';

interface Props {
  registrationId: string;
  onUploaded: () => void;
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function PaymentProofUpload({ registrationId, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
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
      setError('File is larger than 5 MB.');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('registrationId', registrationId);
      await api.post('/payment-proofs', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (evt.total) {
            setProgress(Math.round((evt.loaded * 100) / evt.total));
          }
        },
      });
      setFile(null);
      setPreview(null);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleSelect}
        disabled={uploading}
        className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium hover:file:bg-primary/20 disabled:opacity-50"
      />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL from local file picker; next/image does not support blob: scheme
        <img
          src={preview}
          alt="Proof preview"
          loading="lazy"
          decoding="async"
          className="w-full max-h-72 object-contain rounded-lg border border-gray-200 animate-fade-in"
        />
      )}
      {error && (
        <p className="text-sm text-red-600 animate-slide-down" role="alert">
          {error}
        </p>
      )}
      {uploading && (
        <div className="space-y-1" aria-live="polite">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Uploading…</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all duration-200 active:scale-[0.98] disabled:active:scale-100"
      >
        {uploading ? `Uploading… ${progress}%` : 'Submit Payment Proof'}
      </button>
      <p className="text-xs text-gray-500">
        JPG / PNG / WEBP · Max 5 MB. Make sure the reference number and amount are visible.
      </p>
    </div>
  );
}

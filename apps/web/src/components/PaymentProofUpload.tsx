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
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('registrationId', registrationId);
      await api.post('/payment-proofs', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFile(null);
      setPreview(null);
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
        className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium hover:file:bg-primary/20"
      />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Proof preview"
          className="w-full max-h-72 object-contain rounded-lg border border-gray-200"
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full py-3 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {uploading ? 'Uploading…' : 'Submit Payment Proof'}
      </button>
      <p className="text-xs text-gray-500">
        JPG / PNG / WEBP · Max 5 MB. Make sure the reference number and amount are visible.
      </p>
    </div>
  );
}

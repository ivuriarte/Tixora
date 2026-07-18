'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface PlatformSettings {
  serviceFee: number;
}

export default function PlatformSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<PlatformSettings>({
    queryKey: ['platform-settings'],
    queryFn: () => api.get<{ data: PlatformSettings }>('/admin/settings/platform').then((r) => r.data.data),
  });

  const [fee, setFee] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data && !dirty) {
      setFee(String(data.serviceFee));
    }
  }, [data, dirty]);

  const mutation = useMutation({
    mutationFn: (serviceFee: number) =>
      api.patch('/admin/settings/platform', { serviceFee }),
    onSuccess: () => {
      toast.success('Platform settings saved.');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
    },
    onError: () => toast.error('Could not save settings. Please try again.'),
  });

  const handleSave = () => {
    const parsed = parseFloat(fee);
    if (isNaN(parsed) || parsed < 0 || parsed > 9999) {
      toast.error('Service fee must be between ₱0 and ₱9,999.');
      return;
    }
    mutation.mutate(parsed);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="axon-page-title text-3xl sm:text-4xl">Platform Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          These settings apply platform-wide. Per-event overrides can be set on the Admin Controls section of each event&apos;s edit page.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {/* Service Fee */}
        <div className="p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-gray-900">Default Service Fee</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Flat fee in Philippine Pesos (₱) added to every order, displayed to attendees in the Order Summary. Individual events can override this via Admin Controls.
              </p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2 mt-0.5">
              <span className="text-sm text-gray-600 font-medium">₱</span>
              <input
                type="number"
                min="0"
                max="9999"
                step="0.01"
                disabled={isLoading}
                value={fee}
                onChange={(e) => { setFee(e.target.value); setDirty(true); }}
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-200 focus:outline-none disabled:bg-gray-50"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={mutation.isPending || isLoading || !dirty}
          onClick={handleSave}
          className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Button from '@/components/Button';

export default function AdminNewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    venue: '',
    city: 'Manila',
    startsAt: '',
    endsAt: '',
    maxPerUser: '4',
  });

  function update(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post<{ data: { slug: string } }>('/admin/events', {
        ...form,
        maxPerUser: parseInt(form.maxPerUser, 10),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
      });
      toast.success('Event created!');
      router.push(`/admin`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to create event');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">New Event</h1>
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input name="title" required value={form.title} onChange={update}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" rows={4} value={form.description} onChange={update}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue</label>
              <input name="venue" required value={form.venue} onChange={update}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input name="city" required value={form.city} onChange={update}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starts At</label>
              <input name="startsAt" type="datetime-local" required value={form.startsAt} onChange={update}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ends At <span className="text-gray-400">(optional)</span></label>
              <input name="endsAt" type="datetime-local" value={form.endsAt} onChange={update}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max tickets per user</label>
            <input name="maxPerUser" type="number" min={1} max={10} value={form.maxPerUser} onChange={update}
              className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading} size="lg">Create Event</Button>
            <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>Cancel</Button>
          </div>
        </form>
      </main>
    </>
  );
}

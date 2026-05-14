'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import Button from '@/components/Button';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post<{
        data: { user: any; accessToken: string; refreshToken: string };
      }>('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = res.data.data;
      setAuth(user, accessToken, refreshToken);
      toast.success(`Welcome back, ${user.firstName}!`);
      router.push('/');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Login failed';
      // If account not verified, redirect to verify page
      if (err?.response?.status === 403) {
        toast.error('Please verify your email first.');
        router.push(`/auth/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-primary">Tixora</Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Log in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white shadow rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Log in
          </Button>

          <p className="text-center text-sm text-gray-500">
            No account?{' '}
            <Link href="/auth/register" className="text-primary font-medium hover:underline">
              Sign up free
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

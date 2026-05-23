'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

/**
 * Drop this into any public page that admins should never see.
 * After hydration completes, if the user is an authenticated admin
 * they are immediately redirected to /admin.
 */
export default function AdminRedirect() {
  const { isAuthenticated, isHydrating, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isHydrating && isAuthenticated && user?.isAdmin) {
      router.replace('/admin');
    }
  }, [isHydrating, isAuthenticated, user?.isAdmin, router]);

  return null;
}

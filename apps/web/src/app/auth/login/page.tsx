import { redirect } from 'next/navigation';
import { safeRedirectPath } from '@/lib/safe-redirect';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedRedirect = safeRedirectPath(Array.isArray(params.redirect) ? params.redirect[0] : params.redirect);
  const destination = requestedRedirect
    ? `/auth/access?redirect=${encodeURIComponent(requestedRedirect)}`
    : '/auth/access';

  redirect(destination);
}

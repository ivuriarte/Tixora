import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedRedirect = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;
  const destination =
    requestedRedirect && requestedRedirect.startsWith('/')
      ? `/auth/access?redirect=${encodeURIComponent(requestedRedirect)}`
      : '/auth/access';

  redirect(destination);
}

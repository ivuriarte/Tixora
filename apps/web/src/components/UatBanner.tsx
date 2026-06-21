const appEnv = process.env.NEXT_PUBLIC_APP_ENV;
const gitSha = process.env.NEXT_PUBLIC_GIT_SHA;

export default function UatBanner() {
  if (appEnv !== 'uat') return null;

  return (
    <div
      role="status"
      aria-label="UAT environment — not production"
      className="w-full bg-amber-400 text-amber-950 text-xs font-semibold text-center py-1.5 px-4 flex items-center justify-center gap-3 select-none"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-700 animate-pulse" aria-hidden="true" />
        UAT — Test environment, not production
      </span>
      {gitSha && (
        <span className="font-mono text-amber-800 opacity-80" title={`Git commit: ${gitSha}`}>
          {gitSha.slice(0, 7)}
        </span>
      )}
    </div>
  );
}

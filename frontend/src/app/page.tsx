import { fetchApiHealth } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const health = await fetchApiHealth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">Aperture</h1>
      <p className="max-w-md text-center text-zinc-600">
        Local stack (P0.2). Frontend talks to the API; the API checks Postgres.
      </p>
      <dl className="mt-4 grid min-w-[16rem] gap-2 text-sm text-zinc-800">
        <div className="flex justify-between gap-6">
          <dt className="text-zinc-500">API readiness</dt>
          <dd>{health.ready ? 'ready' : 'not ready'}</dd>
        </div>
        {health.version ? (
          <>
            <div className="flex justify-between gap-6">
              <dt className="text-zinc-500">API version</dt>
              <dd>
                {health.version.name} {health.version.version}
              </dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="text-zinc-500">Environment</dt>
              <dd>{health.version.environment}</dd>
            </div>
          </>
        ) : null}
        {health.error ? (
          <div className="flex justify-between gap-6">
            <dt className="text-zinc-500">Detail</dt>
            <dd className="text-right text-red-700">{health.error}</dd>
          </div>
        ) : null}
      </dl>
    </main>
  );
}

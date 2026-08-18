import { apiBaseUrl } from "@/lib/api/config";

/**
 * Phase 1 landing page. Its job is to prove the stack is wired end to end:
 * the container is serving, and the browser can reach the API.
 * Replaced by the real dashboard and portal in Phase 5.
 */
export default function Home() {
  const routes = [
    { href: "/manager", label: "Office Manager dashboard", phase: "Phase 5" },
    { href: "/portal", label: "Client portal", phase: "Phase 5" },
    { href: `${apiBaseUrl}/health`, label: "API health check", phase: "live" },
    { href: `${apiBaseUrl}/api/docs`, label: "API docs (Swagger)", phase: "live" },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Logistics &amp; import-export management platform
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">CargoTrack</h1>
        <p className="text-slate-600">
          Local development environment is running. Phase 1 &mdash; dev baseline.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Endpoints
        </h2>
        <ul className="divide-y divide-slate-100">
          {routes.map((route) => (
            <li
              key={route.href}
              className="flex items-center justify-between py-3"
            >
              <a
                href={route.href}
                className="text-slate-900 underline-offset-4 hover:underline"
              >
                {route.label}
              </a>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                {route.phase}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-sm text-slate-500">
        API base URL: <code className="text-slate-700">{apiBaseUrl}</code>
      </footer>
    </main>
  );
}

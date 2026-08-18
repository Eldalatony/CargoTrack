import { NextResponse } from "next/server";

/**
 * Liveness endpoint probed by the Docker Compose health check.
 * Deliberately does not call the API — this reports on the Next.js server
 * only, so a backend outage does not mask which service is actually down.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "cargotrack-frontend",
    uptimeSeconds: Math.round(process.uptime()),
  });
}

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/**
 * Proxy route — forwards screening trigger requests to the Python backend.
 * Runs server-side so the browser never makes a cross-origin request.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const authorization = request.headers.get("authorization") ?? "";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorization) headers["Authorization"] = authorization;

  const res = await fetch(`${BACKEND_URL}/api/v1/screening/trigger`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

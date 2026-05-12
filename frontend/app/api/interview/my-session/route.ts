import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/interview/my-session`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
    });

    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        type: "https://int.ai/errors/backend-unreachable",
        title: "Backend Unreachable",
        status: 502,
        detail: "Could not reach backend service",
      },
      { status: 502 }
    );
  }
}

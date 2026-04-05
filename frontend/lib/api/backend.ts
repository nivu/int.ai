const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
}

export class BackendError extends Error {
  status: number;
  detail: string;

  constructor(problem: ProblemDetail) {
    super(problem.title);
    this.status = problem.status;
    this.detail = problem.detail;
  }
}

export async function backendFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const problem: ProblemDetail = await response.json().catch(() => ({
      type: "https://int.ai/errors/unknown",
      title: "Request Failed",
      status: response.status,
      detail: response.statusText,
    }));
    throw new BackendError(problem);
  }

  return response.json() as Promise<T>;
}

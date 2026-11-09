interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiRequestError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

const connectionMessage = "The care-flow API could not be reached. Start the application with `npm run dev` and confirm PostgreSQL is running.";

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers,
    });
  } catch {
    throw new ApiRequestError(connectionMessage, undefined, "API_UNAVAILABLE");
  }

  if (response.status === 204) return undefined as T;

  const responseText = await response.text();
  let payload: unknown;
  if (responseText.trim()) {
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      if (!response.ok) {
        throw new ApiRequestError(connectionMessage, response.status, "API_UNAVAILABLE");
      }
      throw new ApiRequestError("The API returned an unreadable response. Restart the application and try again.", response.status, "INVALID_API_RESPONSE");
    }
  }

  const result = payload && typeof payload === "object" ? payload as ApiErrorPayload : {};
  if (!response.ok) {
    const message = result.error?.message ?? (response.status >= 500 ? connectionMessage : `The request failed (HTTP ${response.status}).`);
    throw new ApiRequestError(message, response.status, result.error?.code ?? "REQUEST_FAILED");
  }
  if (payload === undefined) {
    throw new ApiRequestError("The API returned an empty response. Restart the application and try again.", response.status, "EMPTY_API_RESPONSE");
  }
  return payload as T;
}

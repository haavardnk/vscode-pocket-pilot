class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export class SignInRedirect extends Error {
  constructor() {
    super('Sign in to this address again');
  }
}

export async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    redirect: 'manual',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined
  });
  if (response.type === 'opaqueredirect') throw new SignInRedirect();
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new RequestError(
      response.status,
      typeof message === 'string' ? message : `Request failed (${response.status})`
    );
  }
  return body;
}

// Every call to the server goes through here.
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || 'Something went wrong. Try again.');
    this.status = status;
    this.code = body?.code || 'error';
    this.fields = body?.fields || null;
    this.details = body?.details || null;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'attendance-app',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { code: 'network', message: 'Could not reach the server. Check your connection and try again.' });
  }

  if (response.status === 204) return null;
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Not JSON. Handled as a plain error below.
  }

  if (!response.ok) {
    // Signed out while using the app: go back to the sign-in page and
    // return here afterwards. The sign-in page handles its own 401s.
    const onSignIn = window.location.pathname === '/' || window.location.pathname === '/index.html';
    if (response.status === 401 && !onSignIn) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/?next=${next}`);
      return new Promise(() => {});
    }
    throw new ApiError(response.status, data?.error);
  }
  return data;
}

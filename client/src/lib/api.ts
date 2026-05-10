import { getFirebaseAuth } from './firebase';
import type { AppConfig, MeResponse, Trip } from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function withToken(init: RequestInit = {}): Promise<RequestInit> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new ApiError(401, 'Not signed in');
  const token = await user.getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return { ...init, headers };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      msg = body.error || msg;
      code = body.code;
    } catch { /* ignore non-JSON error bodies */ }
    throw new ApiError(res.status, msg, code);
  }
  return res.json();
}

export async function getConfig(): Promise<AppConfig> {
  return handle<AppConfig>(await fetch('/config'));
}

export async function getMe(): Promise<MeResponse> {
  return handle<MeResponse>(await fetch('/api/me', await withToken()));
}

export async function listTrips(): Promise<{ trips: Trip[] }> {
  return handle<{ trips: Trip[] }>(await fetch('/api/trips', await withToken()));
}

export async function getTrip(id: string): Promise<Trip> {
  return handle<Trip>(await fetch(`/api/trips/${encodeURIComponent(id)}`, await withToken()));
}

export async function createTrip(body: Partial<Trip>): Promise<Trip> {
  return handle<Trip>(await fetch('/api/trips', await withToken({
    method: 'POST', body: JSON.stringify(body),
  })));
}

export async function updateTrip(id: string, body: Partial<Trip>): Promise<Trip> {
  return handle<Trip>(await fetch(`/api/trips/${encodeURIComponent(id)}`, await withToken({
    method: 'PUT', body: JSON.stringify(body),
  })));
}

export async function deleteTrip(id: string): Promise<void> {
  await handle<unknown>(await fetch(`/api/trips/${encodeURIComponent(id)}`, await withToken({
    method: 'DELETE',
  })));
}

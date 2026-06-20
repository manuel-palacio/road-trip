import { getFirebaseAuth } from './firebase';
import type { AppConfig, Favorite, MeResponse, Pin, TemplateCard, Trip } from './types';

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

export async function listPins(tripId: string): Promise<{ pins: Pin[] }> {
  return handle<{ pins: Pin[] }>(
    await fetch(`/api/trips/${encodeURIComponent(tripId)}/pins`, await withToken()),
  );
}

export async function createPin(tripId: string, body: Omit<Pin, 'id' | 'addedByUid' | 'createdAt' | 'updatedAt'>): Promise<Pin> {
  return handle<Pin>(
    await fetch(`/api/trips/${encodeURIComponent(tripId)}/pins`, await withToken({
      method: 'POST', body: JSON.stringify(body),
    })),
  );
}

export async function updatePin(tripId: string, pinId: string, body: Partial<Pin>): Promise<Pin> {
  return handle<Pin>(
    await fetch(`/api/trips/${encodeURIComponent(tripId)}/pins/${encodeURIComponent(pinId)}`, await withToken({
      method: 'PUT', body: JSON.stringify(body),
    })),
  );
}

export async function deletePin(tripId: string, pinId: string): Promise<void> {
  await handle<unknown>(
    await fetch(`/api/trips/${encodeURIComponent(tripId)}/pins/${encodeURIComponent(pinId)}`, await withToken({
      method: 'DELETE',
    })),
  );
}

export async function enableShare(tripId: string): Promise<{ shareToken: string; isShared: boolean }> {
  return handle<{ shareToken: string; isShared: boolean }>(
    await fetch(`/api/trips/${encodeURIComponent(tripId)}/share`, await withToken({
      method: 'POST',
    })),
  );
}

export async function revokeShare(tripId: string): Promise<void> {
  await handle<unknown>(
    await fetch(`/api/trips/${encodeURIComponent(tripId)}/share`, await withToken({
      method: 'DELETE',
    })),
  );
}

export type SharedTripResponse = {
  trip: Omit<Trip, 'ownerUid' | 'collaborators' | 'shareToken' | 'isShared'>;
  pins: Pin[];
  owner: { displayName: string; photoURL: string };
};

// Public — no auth header. Returns 404 if the token is unknown or revoked.
export async function getSharedTrip(token: string): Promise<SharedTripResponse> {
  return handle<SharedTripResponse>(await fetch(`/api/share/${encodeURIComponent(token)}`));
}

// Authenticated download — fetches the file as a Blob and triggers a browser
// save dialog via a temporary anchor with the download attribute. Used for
// /export/pdf and /export/gpx, which need the Authorization header that a
// plain `<a href>` click can't carry.
export type PublishTemplateInput = {
  templateDescription: string;
  templateTags: string[];
  templateVisibility?: 'public' | 'unlisted';
};

export async function publishTemplate(tripId: string, body: PublishTemplateInput): Promise<{ ok: boolean; isTemplate: boolean }> {
  return handle(await fetch(`/api/trips/${encodeURIComponent(tripId)}/publish-template`, await withToken({
    method: 'POST',
    body: JSON.stringify(body),
  })));
}

export async function unpublishTemplate(tripId: string): Promise<{ ok: boolean; isTemplate: boolean }> {
  return handle(await fetch(`/api/trips/${encodeURIComponent(tripId)}/publish-template`, await withToken({
    method: 'DELETE',
  })));
}

// Public — no auth required. Pass tag to filter to a single tag.
export async function listTemplates(opts: { tag?: string; limit?: number } = {}): Promise<{ items: TemplateCard[] }> {
  const params = new URLSearchParams();
  if (opts.tag) params.set('tag', opts.tag);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return handle(await fetch(`/api/templates${qs ? `?${qs}` : ''}`));
}

export async function cloneTemplate(templateId: string): Promise<Trip> {
  return handle<Trip>(await fetch(`/api/templates/${encodeURIComponent(templateId)}/clone`, await withToken({
    method: 'POST',
  })));
}

export async function listFavorites(): Promise<Favorite[]> {
  const j = await handle<{ favorites: Favorite[] }>(await fetch('/api/favorites', await withToken()));
  return j.favorites;
}

export async function createFavorite(body: Omit<Favorite, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>): Promise<Favorite> {
  return handle<Favorite>(await fetch('/api/favorites', await withToken({
    method: 'POST', body: JSON.stringify(body),
  })));
}

export async function deleteFavorite(id: string): Promise<void> {
  await handle<unknown>(await fetch(`/api/favorites/${encodeURIComponent(id)}`, await withToken({
    method: 'DELETE',
  })));
}

export async function lookupUserByEmail(email: string): Promise<{ uid: string; displayName: string; photoURL: string } | null> {
  const r = await fetch(`/api/users/lookup?email=${encodeURIComponent(email)}`, await withToken());
  if (r.status === 404) return null;
  return handle<{ uid: string; displayName: string; photoURL: string }>(r);
}

export async function addCollaborator(tripId: string, email: string): Promise<{ uid: string }> {
  return handle<{ uid: string }>(await fetch(`/api/trips/${encodeURIComponent(tripId)}/collaborators`, await withToken({
    method: 'POST', body: JSON.stringify({ email }),
  })));
}

export async function removeCollaborator(tripId: string, uid: string): Promise<void> {
  await handle<unknown>(await fetch(`/api/trips/${encodeURIComponent(tripId)}/collaborators/${encodeURIComponent(uid)}`, await withToken({
    method: 'DELETE',
  })));
}

export type AdminStats = {
  trips: number;
  users: number;
  templates: number;
  favorites: number;
  proUsers: number;
  freeUsers: number;
};

export type AdminUser = {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  plan: 'free' | 'pro';
  tripLimit?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type AdminTrip = {
  id: string;
  name: string;
  ownerUid: string;
  createdAt?: unknown;
  stops?: unknown[];
  isTemplate?: boolean;
};

export async function adminStats(): Promise<AdminStats> {
  return handle<AdminStats>(await fetch('/api/admin/stats', await withToken()));
}

export async function adminListUsers(opts: { planFilter?: 'all' | 'free' | 'pro'; cursor?: string } = {}): Promise<{ users: AdminUser[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (opts.planFilter && opts.planFilter !== 'all') params.set('planFilter', opts.planFilter);
  if (opts.cursor) params.set('cursor', opts.cursor);
  const qs = params.toString();
  return handle<{ users: AdminUser[]; nextCursor: string | null }>(
    await fetch(`/api/admin/users${qs ? `?${qs}` : ''}`, await withToken()),
  );
}

export async function adminGetUser(uid: string): Promise<AdminUser> {
  return handle<AdminUser>(await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, await withToken()));
}

export async function adminSetPlan(uid: string, plan: 'free' | 'pro', tripLimit?: number): Promise<AdminUser> {
  const body: { plan: string; tripLimit?: number } = { plan };
  if (tripLimit != null) body.tripLimit = tripLimit;
  return handle<AdminUser>(await fetch(`/api/admin/users/${encodeURIComponent(uid)}/plan`, await withToken({
    method: 'PUT', body: JSON.stringify(body),
  })));
}

export async function adminListTrips(opts: { cursor?: string } = {}): Promise<{ trips: AdminTrip[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  const qs = params.toString();
  return handle<{ trips: AdminTrip[]; nextCursor: string | null }>(
    await fetch(`/api/admin/trips${qs ? `?${qs}` : ''}`, await withToken()),
  );
}

export async function adminDeleteTrip(id: string): Promise<{ ok: boolean }> {
  return handle<{ ok: boolean }>(await fetch(`/api/admin/trips/${encodeURIComponent(id)}`, await withToken({
    method: 'DELETE',
  })));
}

export async function downloadAuthed(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(path, await withToken());
  if (!res.ok) {
    let msg = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      msg = body.error || msg;
      code = body.code;
    } catch { /* binary response — fall through */ }
    throw new ApiError(res.status, msg, code);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
  const filename = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

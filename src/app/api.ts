// The UI's only way to the server. Every call names the group by its token;
// the member this device acts as travels in a header for the change log.

import type { ApiErrorDto, CreatedGroupDto, GroupDto, MemberDto } from '../shared/api-types';
import { knownGroup } from './device';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  /** JSON body, or a Blob that is sent as it is (the receipt photo). */
  body?: unknown;
  /** Group token; adds the acting member's header. */
  token?: string;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (options.body instanceof Blob) {
    body = options.body;
    headers['Content-Type'] = options.body.type || 'application/octet-stream';
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  const memberId = options.token ? knownGroup(options.token)?.memberId : null;
  if (memberId) headers['X-Splitti-Member'] = String(memberId);

  let response: Response;
  try {
    response = await fetch(path, { method: options.method ?? 'GET', headers, body });
  } catch {
    throw new ApiRequestError(0, 'offline', 'Keine Verbindung zum Server. Bist du im Heimnetz?');
  }

  if (response.status === 204) return undefined as T;
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const error = data as Partial<ApiErrorDto> | undefined;
    throw new ApiRequestError(
      response.status,
      error?.error ?? 'error',
      error?.message ?? 'Das hat nicht geklappt. Versuch es noch einmal.',
    );
  }
  return data as T;
}

const group = (token: string) => `/api/groups/${encodeURIComponent(token)}`;

export const api = {
  createGroup: (input: { name: string; ownName: string; members: string[] }) =>
    request<CreatedGroupDto>('/api/groups', { method: 'POST', body: input }),

  getGroup: (token: string) => request<GroupDto>(group(token), { token }),

  renameGroup: (token: string, name: string) =>
    request<{ group: GroupDto['group'] }>(group(token), { method: 'PATCH', body: { name }, token }),

  addMember: (token: string, name: string) =>
    request<{ member: MemberDto }>(`${group(token)}/members`, {
      method: 'POST',
      body: { name },
      token,
    }),

  updateMember: (token: string, id: number, change: { name?: string; active?: boolean }) =>
    request<{ member: MemberDto | null }>(`${group(token)}/members/${id}`, {
      method: 'PATCH',
      body: change,
      token,
    }),
};

/** Message for the user from whatever was thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiRequestError
    ? error.message
    : 'Das hat nicht geklappt. Versuch es noch einmal.';
}

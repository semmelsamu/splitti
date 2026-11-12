// What this device remembers: which groups it knows and who it is in each.
// Per the plan this lives in the browser, not in the database.

import { useSyncExternalStore } from 'react';

export interface KnownGroup {
  token: string;
  /** Last known name, shown on the start screen before the server answers. */
  name: string;
  /** The member this device acts as, or null until someone picks one. */
  memberId: number | null;
  /** ISO timestamp of the last visit; the start screen lists recent groups first. */
  openedAt: string;
}

const KEY = 'splitti.groups.v1';
const listeners = new Set<() => void>();
let cache: KnownGroup[] | undefined;

function read(): KnownGroup[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is KnownGroup =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as KnownGroup).token === 'string' &&
        typeof (entry as KnownGroup).name === 'string',
    );
  } catch {
    return [];
  }
}

function write(groups: KnownGroup[]): void {
  cache = groups;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(groups));
  } catch {
    // Storage full or blocked: the app keeps working for this visit.
  }
  for (const listener of listeners) listener();
}

export function knownGroups(): KnownGroup[] {
  cache ??= read();
  return cache;
}

export function knownGroup(token: string): KnownGroup | undefined {
  return knownGroups().find((group) => group.token === token);
}

/** Adds the group to this device or updates its name and visit time. */
export function rememberGroup(token: string, name: string): void {
  const existing = knownGroup(token);
  const entry: KnownGroup = {
    token,
    name,
    memberId: existing?.memberId ?? null,
    openedAt: new Date().toISOString(),
  };
  write([entry, ...knownGroups().filter((group) => group.token !== token)]);
}

export function setIdentity(token: string, memberId: number | null): void {
  write(knownGroups().map((group) => (group.token === token ? { ...group, memberId } : group)));
}

export function forgetGroup(token: string): void {
  write(knownGroups().filter((group) => group.token !== token));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the list.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cache = undefined;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const EMPTY: KnownGroup[] = [];

export function useKnownGroups(): KnownGroup[] {
  return useSyncExternalStore(subscribe, knownGroups, () => EMPTY);
}

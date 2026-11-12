// Receipt images on disk. A scan first stores a draft image; saving the
// receipt moves it to the group's image folder. Everything lives below the
// data directory, in a folder per group, so one group can never reach the
// images of another.

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './config.mjs';
import { notFound } from './http';

/** Drafts that never became a receipt are removed after this time. */
const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1000;

const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function draftDir(groupId: number): string {
    return path.join(dataDir(), 'drafts', String(groupId));
}

function draftFile(groupId: number, imageId: string): string {
    // The id is a UUID made here; anything else never touches the file system.
    if (!IMAGE_ID.test(imageId)) throw notFound('Dieses Zettelbild gibt es nicht.');
    return path.join(draftDir(groupId), `${imageId}.jpg`);
}

/** Stores the JPEG of a scan as a draft and returns its handle. */
export function saveDraftImage(groupId: number, jpeg: Buffer): string {
    const imageId = randomUUID();
    fs.mkdirSync(draftDir(groupId), { recursive: true });
    fs.writeFileSync(draftFile(groupId, imageId), jpeg);
    return imageId;
}

export function readDraftImage(groupId: number, imageId: string): Buffer {
    const file = draftFile(groupId, imageId);
    if (!fs.existsSync(file)) throw notFound('Dieses Zettelbild gibt es nicht mehr.');
    return fs.readFileSync(file);
}

/**
 * Turns a draft image into the image of a saved receipt.
 * Returns the path to store in the database, relative to the data directory.
 */
export function adoptDraftImage(groupId: number, imageId: string): string {
    const source = draftFile(groupId, imageId);
    if (!fs.existsSync(source)) {
        throw notFound('Das Zettelbild ist nicht mehr da. Bitte scanne den Zettel noch einmal.');
    }
    const relative = path.join('images', String(groupId), `${imageId}.jpg`);
    const target = path.join(dataDir(), relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    return relative;
}

/** The stored image of a receipt. The path comes from the database, never from the request. */
export function readReceiptImage(imagePath: string): Buffer {
    const root = dataDir();
    const file = path.resolve(root, imagePath);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
        throw notFound('Dieses Zettelbild gibt es nicht.');
    }
    return fs.readFileSync(file);
}

/** Removes draft images of all groups that are older than a day. */
export function removeOldDrafts(now = Date.now()): void {
    const root = path.join(dataDir(), 'drafts');
    let groups: string[];
    try {
        groups = fs.readdirSync(root);
    } catch {
        return;
    }
    for (const group of groups) {
        const dir = path.join(root, group);
        try {
            for (const name of fs.readdirSync(dir)) {
                const file = path.join(dir, name);
                if (now - fs.statSync(file).mtimeMs > DRAFT_LIFETIME_MS)
                    fs.rmSync(file, { force: true });
            }
        } catch {
            // A file vanished in between or the entry is not a folder: nothing to clean.
        }
    }
}

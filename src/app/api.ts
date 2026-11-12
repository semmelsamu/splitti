// The UI's only way to the server. Every call names the group by its token;
// the member this device acts as travels in a header for the change log.

import type {
    ApiErrorDto,
    CreatedGroupDto,
    GroupDto,
    HistoryDto,
    MemberDto,
    PaymentInput,
    ReceiptDetailDto,
    ReceiptInput,
    ReceiptSummaryDto,
    ScanDto,
    TransferDto,
} from '../shared/api-types';
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
        throw new ApiRequestError(
            0,
            'offline',
            'Keine Verbindung zum Server. Bist du im Heimnetz?',
        );
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
        request<{ group: GroupDto['group'] }>(group(token), {
            method: 'PATCH',
            body: { name },
            token,
        }),

    addMember: (token: string, name: string) =>
        request<{ member: MemberDto }>(`${group(token)}/members`, {
            method: 'POST',
            body: { name },
            token,
        }),

    updateMember: (
        token: string,
        id: number,
        change: { name?: string; active?: boolean; color?: string },
    ) =>
        request<{ member: MemberDto | null }>(`${group(token)}/members/${id}`, {
            method: 'PATCH',
            body: change,
            token,
        }),

    listReceipts: (token: string) =>
        request<{ receipts: ReceiptSummaryDto[] }>(`${group(token)}/receipts`, { token }),

    getReceipt: (token: string, id: number) =>
        request<ReceiptDetailDto>(`${group(token)}/receipts/${id}`, { token }),

    createReceipt: (token: string, input: ReceiptInput) =>
        request<{ id: number }>(`${group(token)}/receipts`, { method: 'POST', body: input, token }),

    updateReceipt: (token: string, id: number, input: ReceiptInput) =>
        request<ReceiptDetailDto>(`${group(token)}/receipts/${id}`, {
            method: 'PUT',
            body: input,
            token,
        }),

    deleteReceipt: (token: string, id: number) =>
        request<{ ok: true }>(`${group(token)}/receipts/${id}`, { method: 'DELETE', token }),

    restoreReceipt: (token: string, id: number) =>
        request<ReceiptDetailDto>(`${group(token)}/receipts/${id}/restore`, {
            method: 'POST',
            token,
        }),

    getHistory: (token: string) => request<HistoryDto>(`${group(token)}/changes`, { token }),

    getSettlement: (token: string) =>
        request<{ transfers: TransferDto[] }>(`${group(token)}/settlement`, { token }),

    createPayment: (token: string, input: PaymentInput) =>
        request<{ id: number }>(`${group(token)}/payments`, { method: 'POST', body: input, token }),

    deletePayment: (token: string, id: number) =>
        request<{ ok: true }>(`${group(token)}/payments/${id}`, { method: 'DELETE', token }),

    /** Address of the photo of a saved receipt. */
    receiptImageUrl: (token: string, id: number) => `${group(token)}/receipts/${id}/image`,

    /** Address of the photo of a scan that is not saved yet. */
    draftImageUrl: (token: string, imageId: string) =>
        `${group(token)}/scan/${encodeURIComponent(imageId)}`,
};

/**
 * Uploads a receipt photo for recognition. XMLHttpRequest instead of fetch,
 * because only it reports how much of the upload is done.
 *
 * @param onUploaded Share of the photo that has reached the server, 0 to 1.
 */
export function uploadScan(
    token: string,
    photo: Blob,
    onUploaded: (share: number) => void,
): Promise<ScanDto> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${group(token)}/scan`);
        xhr.responseType = 'json';
        xhr.setRequestHeader('Content-Type', photo.type || 'image/jpeg');
        const memberId = knownGroup(token)?.memberId;
        if (memberId) xhr.setRequestHeader('X-Splitti-Member', String(memberId));
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onUploaded(event.loaded / event.total);
        };
        xhr.upload.onload = () => onUploaded(1);
        xhr.onerror = () =>
            reject(
                new ApiRequestError(
                    0,
                    'offline',
                    'Keine Verbindung zum Server. Bist du im Heimnetz?',
                ),
            );
        xhr.onload = () => {
            const data = xhr.response as (ScanDto & Partial<ApiErrorDto>) | null;
            if (xhr.status >= 200 && xhr.status < 300 && data) {
                resolve(data);
            } else {
                reject(
                    new ApiRequestError(
                        xhr.status,
                        data?.error ?? 'error',
                        data?.message ??
                            'Die Erkennung hat nicht geklappt. Versuch es noch einmal.',
                    ),
                );
            }
        };
        xhr.send(photo);
    });
}

/** Message for the user from whatever was thrown. */
export function errorMessage(error: unknown): string {
    return error instanceof ApiRequestError
        ? error.message
        : 'Das hat nicht geklappt. Versuch es noch einmal.';
}

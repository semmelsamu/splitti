import { groupRoute, idParam } from '../../../../../../server/http';
import { readReceiptImage, smallImage } from '../../../../../../server/images';
import { receiptImagePath } from '../../../../../../server/receipts';

// GET /api/groups/:token/receipts/:id/image: the photo of the receipt.
// With ?size=small a small version of it, for lists.
export const GET = groupRoute(async ({ db, group, params, url }) => {
    const image = readReceiptImage(receiptImagePath(db, group, idParam(params.id)));
    const body = url.searchParams.get('size') === 'small' ? await smallImage(image) : image;
    return new Response(new Uint8Array(body), {
        // The image of a receipt never changes.
        headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'private, max-age=31536000, immutable',
        },
    });
});

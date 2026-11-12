import { groupRoute, idParam } from '../../../../../../server/http';
import { readReceiptImage } from '../../../../../../server/images';
import { receiptImagePath } from '../../../../../../server/receipts';

// GET /api/groups/:token/receipts/:id/image: the photo of the receipt.
export const GET = groupRoute(({ db, group, params }) => {
    const image = readReceiptImage(receiptImagePath(db, group, idParam(params.id)));
    return new Response(new Uint8Array(image), {
        // The image of a receipt never changes.
        headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'private, max-age=31536000, immutable',
        },
    });
});

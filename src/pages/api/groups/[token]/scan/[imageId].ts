import { groupRoute } from '../../../../../server/http';
import { readDraftImage } from '../../../../../server/images';

// GET /api/groups/:token/scan/:imageId: the image of a scan that is not saved
// yet, so the split screen can show it. Not in the plan's API table; see
// docs/DECISIONS.md.
export const GET = groupRoute(({ group, params }) => {
    const image = readDraftImage(group.id, params.imageId ?? '');
    return new Response(new Uint8Array(image), {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' },
    });
});

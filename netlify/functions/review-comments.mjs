import { getStore } from '@netlify/blobs';
import { handleReviewRequest } from './_review-core.mjs';

export default async request => {
  try {
    const store = getStore('review-prototype-comments', { consistency: 'strong' });
    return await handleReviewRequest(request, process.env, store);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process comment';
    return Response.json({ error: message }, { status: 400 });
  }
};

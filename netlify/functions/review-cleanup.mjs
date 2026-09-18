import { getStore } from '@netlify/blobs';
import { cleanupExpired } from './_review-core.mjs';

export default async () => {
  const store = getStore('review-prototype-comments', { consistency: 'strong' });
  const result = await cleanupExpired(store);
  return Response.json({ ok: true, ...result });
};

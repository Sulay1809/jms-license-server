import crypto from 'crypto';
import { config } from '../config.js';

export function verifyWebhookSignature(rawBody, signature) {
  if (!config.lemonWebhookSecret) return false;
  if (!signature) return false;

  const digest = crypto
    .createHmac('sha256', config.lemonWebhookSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  } catch {
    return false;
  }
}

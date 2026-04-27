import dotenv from 'dotenv';

dotenv.config();

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/license.sqlite',

  lemonLicenseApiBase:
    process.env.LEMON_LICENSE_API_BASE || 'https://api.lemonsqueezy.com/v1/licenses',
  lemonWebhookSecret: process.env.LEMON_WEBHOOK_SECRET || '',

  allowedExtensionIds: csv(process.env.ALLOWED_EXTENSION_IDS),
  allowedOrigins: csv(process.env.ALLOWED_ORIGINS),

  lemonProductId: String(process.env.LEMON_PRODUCT_ID || ''),
  lemonMonthlyVariantId: String(process.env.LEMON_MONTHLY_VARIANT_ID || ''),
  lemonYearlyVariantId: String(process.env.LEMON_YEARLY_VARIANT_ID || ''),

  strictEmailMatch: bool(process.env.STRICT_EMAIL_MATCH, false)
};

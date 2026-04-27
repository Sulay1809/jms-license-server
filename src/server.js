import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { db, nowIso } from './db.js';
import { activateLicense, validateLicense, deactivateLicense } from './utils/lemon.js';
import { verifyWebhookSignature } from './utils/webhook.js';

const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (config.allowedOrigins.length === 0) return callback(null, true);
    if (config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed'));
  }
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'jms-license-server' });
});

app.post('/api/v1/license/activate', express.json(), async (req, res) => {
  try {
    const { licenseKey, email = '', deviceId } = req.body || {};
    if (!licenseKey || !deviceId) {
      return res.status(400).json({ error: 'licenseKey and deviceId are required.' });
    }

    const existing = db.prepare(`
      SELECT * FROM license_activations
      WHERE license_key = ? AND status = 'active'
    `).get(licenseKey);

    if (existing && existing.device_id !== deviceId) {
      return res.status(409).json({
        error: 'This license is already active on another device. Deactivate it first.'
      });
    }

    const result = await activateLicense(licenseKey, deviceId);

    if (!result?.activated || !result?.instance?.id) {
      return res.status(400).json({ error: result?.error || 'Activation failed.' });
    }

    const customerEmail = String(result?.meta?.customer_email || '').trim().toLowerCase();
    if (config.strictEmailMatch && email) {
      if (customerEmail && customerEmail !== String(email).trim().toLowerCase()) {
        return res.status(403).json({ error: 'Checkout email does not match this license.' });
      }
    }

    const productId = String(result?.meta?.product_id || '');
    const variantId = String(result?.meta?.variant_id || '');

    if (config.lemonProductId && productId !== config.lemonProductId) {
      return res.status(403).json({ error: 'This license does not belong to this product.' });
    }

    const ts = nowIso();

    db.prepare(`
      INSERT INTO licenses (
        license_key, instance_id, status, customer_email, product_id, variant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(license_key) DO UPDATE SET
        instance_id=excluded.instance_id,
        status=excluded.status,
        customer_email=excluded.customer_email,
        product_id=excluded.product_id,
        variant_id=excluded.variant_id,
        updated_at=excluded.updated_at
    `).run(
      licenseKey,
      result.instance.id,
      result.license_key?.status || 'active',
      customerEmail,
      productId,
      variantId,
      ts,
      ts
    );

    db.prepare(`
      INSERT INTO license_activations (
        license_key, device_id, instance_id, status, activated_at, deactivated_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, NULL, ?, ?)
      ON CONFLICT(license_key, device_id) DO UPDATE SET
        instance_id=excluded.instance_id,
        status='active',
        activated_at=excluded.activated_at,
        deactivated_at=NULL,
        updated_at=excluded.updated_at
    `).run(
      licenseKey,
      deviceId,
      result.instance.id,
      ts,
      ts,
      ts
    );

    db.prepare(`
      INSERT INTO audit_logs (action, license_key, device_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('activate', licenseKey, deviceId, JSON.stringify(result), ts);

    return res.json({
      ok: true,
      instanceId: result.instance.id,
      activatedAt: ts,
      licenseStatus: result.license_key?.status || 'active',
      customerEmail
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Activation error.' });
  }
});

app.post('/api/v1/license/validate', express.json(), async (req, res) => {
  try {
    const { licenseKey, instanceId = '', deviceId } = req.body || {};
    if (!licenseKey || !deviceId) {
      return res.status(400).json({ error: 'licenseKey and deviceId are required.' });
    }

    const result = await validateLicense(licenseKey, instanceId);

    if (!result?.valid) {
      return res.status(403).json({ error: result?.error || 'License is not valid.' });
    }

    const activation = db.prepare(`
      SELECT * FROM license_activations
      WHERE license_key = ? AND device_id = ? AND status = 'active'
    `).get(licenseKey, deviceId);

    if (!activation) {
      return res.status(403).json({ error: 'This device is not the active device for the license.' });
    }

    const ts = nowIso();
    db.prepare(`
      UPDATE licenses
      SET status = ?, updated_at = ?
      WHERE license_key = ?
    `).run(result.license_key?.status || 'active', ts, licenseKey);

    db.prepare(`
      INSERT INTO audit_logs (action, license_key, device_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('validate', licenseKey, deviceId, JSON.stringify(result), ts);

    return res.json({
      ok: true,
      instanceId: result?.instance?.id || instanceId,
      activatedAt: activation.activated_at,
      licenseStatus: result.license_key?.status || 'active',
      customerEmail: String(result?.meta?.customer_email || '').trim().toLowerCase()
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Validation error.' });
  }
});

app.post('/api/v1/license/deactivate', express.json(), async (req, res) => {
  try {
    const { licenseKey, instanceId, deviceId } = req.body || {};
    if (!licenseKey || !instanceId || !deviceId) {
      return res.status(400).json({ error: 'licenseKey, instanceId and deviceId are required.' });
    }

    const result = await deactivateLicense(licenseKey, instanceId);

    if (!result?.deactivated) {
      return res.status(400).json({ error: result?.error || 'Deactivation failed.' });
    }

    const ts = nowIso();

    db.prepare(`
      UPDATE license_activations
      SET status = 'inactive', deactivated_at = ?, updated_at = ?
      WHERE license_key = ? AND device_id = ?
    `).run(ts, ts, licenseKey, deviceId);

    db.prepare(`
      UPDATE licenses
      SET status = ?, updated_at = ?
      WHERE license_key = ?
    `).run(result.license_key?.status || 'inactive', ts, licenseKey);

    db.prepare(`
      INSERT INTO audit_logs (action, license_key, device_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('deactivate', licenseKey, deviceId, JSON.stringify(result), ts);

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Deactivation error.' });
  }
});

app.post('/api/v1/webhooks/lemonsqueezy', express.text({ type: '*/*' }), (req, res) => {
  try {
    const signature = req.header('X-Signature') || '';
    const rawBody = req.body || '';

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    const payload = JSON.parse(rawBody);
    const ts = nowIso();

    db.prepare(`
      INSERT INTO webhook_events (event_name, event_id, payload, received_at)
      VALUES (?, ?, ?, ?)
    `).run(
      payload.meta?.event_name || '',
      payload.data?.id || '',
      rawBody,
      ts
    );

    db.prepare(`
      INSERT INTO audit_logs (action, license_key, device_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('webhook', null, null, rawBody, ts);

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Webhook error.' });
  }
});

app.listen(config.port, () => {
  console.log(`JMS license server running on port ${config.port}`);
});

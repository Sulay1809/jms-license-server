import { config } from '../config.js';

async function lemonPost(path, formData) {
  const body = new URLSearchParams(formData);

  const res = await fetch(`${config.lemonLicenseApiBase}${path}`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `Lemon request failed (${res.status})`);
  }

  return data;
}

export async function activateLicense(licenseKey, instanceName) {
  return lemonPost('/activate', {
    license_key: licenseKey,
    instance_name: instanceName
  });
}

export async function validateLicense(licenseKey, instanceId = '') {
  const payload = { license_key: licenseKey };
  if (instanceId) payload.instance_id = instanceId;
  return lemonPost('/validate', payload);
}

export async function deactivateLicense(licenseKey, instanceId) {
  return lemonPost('/deactivate', {
    license_key: licenseKey,
    instance_id: instanceId
  });
}

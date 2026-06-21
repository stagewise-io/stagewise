'use server';

const WEBHOOK_URL = process.env.ATTIO_ENTERPRISE_CONTACT_WEBHOOK_URL;

export async function submitEnterpriseInquiry(formData: {
  name: string;
  company: string;
  position: string;
  email: string;
  phone: string;
  problem: string;
}) {
  const body = JSON.stringify({
    name: formData.name,
    company: formData.company,
    position: formData.position,
    mail: formData.email,
    phone: formData.phone,
    problem: formData.problem,
  });

  if (!WEBHOOK_URL) {
    throw new Error('ATTIO_ENTERPRISE_CONTACT_WEBHOOK_URL is not configured');
  }

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Webhook request failed with status ${res.status}`);
  }
}

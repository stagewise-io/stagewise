'use server';

const WEBHOOK_URL = process.env.ATTIO_ENTERPRISE_CONTACT_WEBHOOK_URL;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EnterpriseFormErrors = Partial<
  Record<'name' | 'company' | 'email' | 'problem', string>
>;

export type EnterpriseFormResult =
  | { success: true }
  | { success: false; errors: EnterpriseFormErrors };

function validateFormData(formData: {
  name: string;
  company: string;
  position: string;
  email: string;
  phone: string;
  problem: string;
}): EnterpriseFormErrors {
  const errors: EnterpriseFormErrors = {};

  if (!formData.name.trim()) {
    errors.name = 'Name is required';
  } else if (formData.name.trim().length > 200) {
    errors.name = 'Name must be at most 200 characters';
  }

  if (!formData.company.trim()) {
    errors.company = 'Company is required';
  } else if (formData.company.trim().length > 200) {
    errors.company = 'Company must be at most 200 characters';
  }

  if (!formData.email.trim()) {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(formData.email.trim())) {
    errors.email = 'Please enter a valid email address';
  } else if (formData.email.trim().length > 320) {
    errors.email = 'Email must be at most 320 characters';
  }

  if (!formData.problem.trim()) {
    errors.problem = 'Please describe your needs';
  } else if (formData.problem.trim().length > 5000) {
    errors.problem = 'Description must be at most 5000 characters';
  }

  return errors;
}

export async function submitEnterpriseInquiry(formData: {
  name: string;
  company: string;
  position: string;
  email: string;
  phone: string;
  problem: string;
}): Promise<EnterpriseFormResult> {
  const errors = validateFormData(formData);

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  if (!WEBHOOK_URL) {
    throw new Error('ATTIO_ENTERPRISE_CONTACT_WEBHOOK_URL is not configured');
  }

  const body = JSON.stringify({
    name: formData.name.trim(),
    company: formData.company.trim(),
    position: formData.position.trim(),
    mail: formData.email.trim(),
    phone: formData.phone.trim(),
    problem: formData.problem.trim(),
  });

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Webhook request failed with status ${res.status}`);
  }

  return { success: true };
}

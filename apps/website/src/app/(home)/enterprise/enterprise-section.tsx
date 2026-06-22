'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import {
  IconCheckOutline18,
  IconPhoneOutline18,
  IconArrowRightOutline18,
} from 'nucleo-ui-outline-18';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import { submitEnterpriseInquiry, type EnterpriseFormErrors } from './actions';

const MIN_LENGTH = { name: 2, company: 2, position: 2, problem: 3 };
const VALIDATION_MSGS: Record<string, string> = {
  name: 'Please enter your full name.',
  company: 'Company name is too short.',
  position: 'Position is too short.',
  problem: 'Please describe your use case.',
};

const VC_LOGOS = [
  {
    src: '/logos/yc-monochrome.svg',
    alt: 'Y Combinator',
    isSvg: true,
  },
  {
    src: '/logos/twentytwo.webp',
    alt: 'TwentyTwo Ventures',
    isSvg: false,
  },
  {
    src: '/logos/blast-monochrome.svg',
    alt: 'Blast Club',
    isSvg: true,
  },
  {
    src: '/logos/teutoseedclub-monochrome.svg',
    alt: 'Teuto Seed Club',
    isSvg: true,
  },
];

const ENTERPRISE_FEATURES = [
  'Regulatory and audit compliance',
  'Global configuration of inference and models',
  'Access to stagewise Cloud Inference and stagewise Cloud Inference EU',
  'SSO with OIDC and SAML',
  'Provisioning with SCIM',
  'Optional self-hosting of the stagewise Cloud',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormData {
  name: string;
  company: string;
  position: string;
  email: string;
  phone: string;
  problem: string;
}

export function EnterpriseSection() {
  const [form, setForm] = useState<FormData>({
    name: '',
    company: '',
    position: '',
    email: '',
    phone: '',
    problem: '',
  });

  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<EnterpriseFormErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<keyof FormData, boolean>>
  >({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const update = (field: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const blur = (field: keyof FormData) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  const emailError =
    form.email.trim() && !EMAIL_RE.test(form.email.trim())
      ? 'Please enter a valid email address.'
      : undefined;

  const fieldErrors = useMemo(() => {
    const e: Partial<Record<keyof FormData, string>> = {};
    const show = (field: keyof FormData) => touched[field] || submitAttempted;

    for (const field of ['name', 'company', 'problem'] as const) {
      const val = form[field].trim();
      const min = MIN_LENGTH[field];
      if (val && val.length < min && show(field)) {
        e[field] = VALIDATION_MSGS[field];
      }
      if (serverErrors[field]) {
        e[field] = serverErrors[field];
      }
    }
    // position is client-validated only (not required server-side)
    if (
      form.position.trim() &&
      form.position.trim().length < MIN_LENGTH.position &&
      show('position')
    ) {
      e.position = VALIDATION_MSGS.position;
    }
    if (serverErrors.position) {
      e.position = serverErrors.position;
    }
    if (serverErrors.phone) {
      e.phone = serverErrors.phone;
    }
    if (serverErrors.email) {
      e.email = serverErrors.email;
    } else if (emailError && show('email')) {
      e.email = emailError;
    }
    return e;
  }, [form, serverErrors, emailError, touched, submitAttempted]);

  const isValid =
    form.name.trim().length >= MIN_LENGTH.name &&
    form.company.trim().length >= MIN_LENGTH.company &&
    form.position.trim().length >= MIN_LENGTH.position &&
    EMAIL_RE.test(form.email.trim()) &&
    form.problem.trim().length >= MIN_LENGTH.problem;

  const handleSubmit = () => {
    setSubmitError(null);
    setServerErrors({});
    setSubmitAttempted(true);
    startTransition(async () => {
      try {
        const result = await submitEnterpriseInquiry({
          name: form.name.trim(),
          company: form.company.trim(),
          position: form.position.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          problem: form.problem.trim(),
        });
        if (result.success) {
          setSubmitted(true);
        } else {
          setServerErrors(result.errors);
        }
      } catch {
        setSubmitError('Something went wrong. Please try again.');
      }
    });
  };

  return (
    <ScrollReveal>
      <div className="mt-16 flex flex-col gap-10 md:flex-row md:gap-16">
        {/* Features */}
        <div className="flex-1 space-y-6">
          <h2 className="font-medium text-foreground text-lg">
            Leverage AI driven development in your organization with stagewise.
          </h2>

          <ul className="space-y-4">
            {ENTERPRISE_FEATURES.map((label) => (
              <li
                key={label}
                className="flex items-start gap-3"
                style={{ listStyle: 'none' }}
              >
                <IconCheckOutline18 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-foreground" />
                <span className="text-foreground">{label}</span>
              </li>
            ))}
          </ul>

          <a
            href="https://docs.stagewise.io/enterprise"
            className="mt-2 inline-flex items-center gap-2 text-base text-primary-foreground hover:text-hover-derived active:text-active-derived"
          >
            Learn more about stagewise for Enterprises
            <IconArrowRightFill18 className="inline size-4" />
          </a>

          <div className="mt-6 space-y-3">
            <p className="font-medium text-muted-foreground text-sm">
              Backed by
            </p>
            <div className="flex flex-wrap items-center gap-6">
              {VC_LOGOS.map((logo) => (
                // biome-ignore lint/performance/noImgElement: Raw <img> needed — next/image sets color:transparent breaking SVG currentColor
                <img
                  key={logo.alt}
                  src={logo.src}
                  alt={logo.alt}
                  className={
                    logo.isSvg
                      ? 'h-5 w-auto shrink-0 opacity-60 dark:invert'
                      : 'h-5 w-auto shrink-0 opacity-60 brightness-0 grayscale dark:invert'
                  }
                />
              ))}
            </div>
          </div>
        </div>

        {/* Form */}
        {submitted ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl bg-surface-1 p-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900">
              <IconCheckOutline18 className="size-7 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="space-y-2">
              <h3 className="font-medium text-2xl text-foreground">
                Thank you for your inquiry
              </h3>
              <p className="text-muted-foreground">
                We have received your message and will get back to you shortly.
              </p>
            </div>
          </div>
        ) : (
          <form
            className="flex-1 space-y-6 rounded-2xl bg-surface-1 p-6 md:p-8"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <h3 className="font-medium text-2xl text-foreground">
              Get in touch
            </h3>

            <div className="flex flex-col gap-2">
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="font-medium text-foreground text-sm">
                    Name
                  </span>
                  <input
                    type="text"
                    placeholder="Jane Smith"
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    onBlur={() => blur('name')}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary-500"
                  />
                  {fieldErrors.name && (
                    <p className="text-red-500 text-xs">{fieldErrors.name}</p>
                  )}
                </label>
                <label className="space-y-1.5">
                  <span className="font-medium text-foreground text-sm">
                    Company
                  </span>
                  <input
                    type="text"
                    placeholder="Acme Inc."
                    value={form.company}
                    onChange={(e) => update('company', e.target.value)}
                    onBlur={() => blur('company')}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary-500"
                  />
                  {fieldErrors.company && (
                    <p className="text-red-500 text-xs">
                      {fieldErrors.company}
                    </p>
                  )}
                </label>
              </div>
              <label className="space-y-1.5">
                <span className="font-medium text-foreground text-sm">
                  Position
                </span>
                <input
                  type="text"
                  placeholder="VP of Engineering"
                  value={form.position}
                  onChange={(e) => update('position', e.target.value)}
                  onBlur={() => blur('position')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary-500"
                />
                {fieldErrors.position && (
                  <p className="text-red-500 text-xs">{fieldErrors.position}</p>
                )}
              </label>
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="font-medium text-foreground text-sm">
                    Company email
                  </span>
                  <input
                    type="email"
                    placeholder="jane@acme.com"
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                    onBlur={() => blur('email')}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary-500"
                  />
                  {fieldErrors.email && (
                    <p className="text-red-500 text-xs">{fieldErrors.email}</p>
                  )}
                </label>
                <label className="space-y-1.5">
                  <span className="font-medium text-foreground text-sm">
                    Phone{' '}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </span>
                  <input
                    type="tel"
                    placeholder="+1 555 123 4567"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                    onBlur={() => blur('phone')}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary-500"
                  />
                  {fieldErrors.phone && (
                    <p className="text-red-500 text-xs">{fieldErrors.phone}</p>
                  )}
                </label>
              </div>
              <label className="space-y-1.5">
                <span className="font-medium text-foreground text-sm">
                  What problem are you trying to solve?
                </span>
                <textarea
                  placeholder="Tell us about your team's use case…"
                  value={form.problem}
                  onChange={(e) => update('problem', e.target.value)}
                  onBlur={() => blur('problem')}
                  rows={4}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary-500"
                />
                {fieldErrors.problem && (
                  <p className="text-red-500 text-xs">{fieldErrors.problem}</p>
                )}
              </label>
            </div>

            {submitError && (
              <p className="text-red-500 text-sm">{submitError}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <a
                href="https://calendar.app.google/84HftBtaqpwiEXbv8"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: 'secondary', size: 'lg' }),
                  'bg-surface-2',
                )}
              >
                Book a call
                <IconPhoneOutline18 className="size-[18px] shrink-0" />
              </a>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!isValid || isPending}
              >
                {isPending ? 'Sending…' : 'Send inquiry'}
                <IconArrowRightOutline18 className="size-[18px] shrink-0" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </ScrollReveal>
  );
}

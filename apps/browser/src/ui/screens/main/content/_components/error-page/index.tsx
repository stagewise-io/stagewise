import { useKartonState } from '@/hooks/use-karton';

export function ErrorPage() {
  const activeTab = useKartonState((s) => s.browser.tabs.activeTab);
  const error = useKartonState((s) => s.browser.tabs[activeTab.id].error);

  if (!error) {
    return null;
  }

  return (
    <div
      className="flex size-full flex-col items-center justify-center overflow-hidden bg-background"
      id="error-page-container"
    >
      <div className="w-full max-w-2xl">
        <ErrorContentRouter code={error.code} message={error.message} />
      </div>
    </div>
  );
}

const ErrorContentRouter = ({
  code,
  message,
}: {
  code: number;
  message: string;
}) => {
  if (code <= -1 && code > -100) {
    return <SystemRelatedError code={code} message={message} />;
  }
  if (code <= -100 && code > -200) {
    return <ConnectionRelatedError code={code} message={message} />;
  }
  if (code <= -200 && code > -300) {
    return <CertificateRelatedError code={code} message={message} />;
  }
  if (code <= -300 && code > -400) {
    return <HTTPError code={code} message={message} />;
  }
  if (code <= -400 && code > -500) {
    return <CacheError code={code} message={message} />;
  }
  if (code <= -700 && code > -800) {
    return <CertificateManagerError code={code} message={message} />;
  }
  if (code <= -800 && code > -900) {
    return <DNSResolverError code={code} message={message} />;
  }
  if (code <= -900 && code > -1000) {
    return <BlobError code={code} message={message} />;
  }

  return <OtherError code={code} message={message} />;
};

export function SystemRelatedError({
  code,
  message,
}: {
  code: number;
  message: string;
}) {
  return null;
}

export function ConnectionRelatedError({
  code,
  message,
}: {
  code: number;
  message: string;
}) {
  return null;
}

export function CertificateRelatedError({
  code,
  message,
}: {
  code: number;
  message: string;
}) {
  return null;
}

export function HTTPError({
  code,
  message,
}: {
  code: number;
  message: string;
}) {
  return null;
}

export function CacheError({
  code,
  message,
}: {
  code: number;
  message: string;
}) {
  return null;
}

export function CertificateManagerError({
  code,
  message,
}: {
  code: number;
  message: string;
}) {
  return null;
}

export function DNSResolverError({
  code,
  message,
}: {
  code: number;
  message: string;
}) {
  return null;
}

export function BlobError({
  code,
  message,
}: {
  code: number;
  message: string;
}) {
  return null;
}

export function OtherError({
  code,
  message,
}: {
  code: number;
  message: string;
}) {
  return null;
}

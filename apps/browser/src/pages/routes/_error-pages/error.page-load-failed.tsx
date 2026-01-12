import { createFileRoute, useSearch } from '@tanstack/react-router';
import {
  ErrorDisplay,
  type ErrorDisplayProps,
} from '@/components/error-display';
import {
  classifyError,
  getErrorName,
} from '@shared/chromium-errors/error-classification';
import { useKartonProcedure } from '@/hooks/use-karton';

import StagemanAskingForInput from '@assets/stageman/asking-for-input.png';
import StagemanCertError from '@assets/stageman/cert-error.png';
import StagemanDetectiveStopping from '@assets/stageman/detective-stopping.png';
import StagemanDnsError from '@assets/stageman/dns-error.png';
import StagemanNoOSResourceAccess from '@assets/stageman/no-access.png';
import StagemanNoConnection from '@assets/stageman/no-connection.png';
import StagemanSleeping from '@assets/stageman/sleeping.png';
import StagemanCrash from '@assets/stageman/crash.png';

import type { ErrorCategory } from '@shared/chromium-errors/error-classification';

/**
 * Error codes that require user action/input (StagemanAskingForInput)
 */
const USER_ACTION_REQUIRED_ERRORS = new Set([
  -110, // SSL_CLIENT_AUTH_CERT_NEEDED - user needs to select a client certificate
]);

/**
 * Timeout/unresponsive errors - server not responding (StagemanSleeping)
 */
const TIMEOUT_ERRORS = new Set([
  -7, // TIMED_OUT (generic)
  -118, // CONNECTION_TIMED_OUT
  -324, // EMPTY_RESPONSE - server sent nothing
  -803, // DNS_TIMED_OUT
]);

/**
 * Browser policy blocks - browser refuses to load (StagemanDetectiveStopping)
 */
const BROWSER_POLICY_BLOCKED_ERRORS = new Set([
  -20, // BLOCKED_BY_CLIENT
  -22, // BLOCKED_BY_ADMINISTRATOR
  -27, // BLOCKED_BY_RESPONSE
  -29, // CLEARTEXT_NOT_PERMITTED
  -30, // BLOCKED_BY_CSP
  -32, // BLOCKED_BY_ORB
  -34, // BLOCKED_BY_FINGERPRINTING_PROTECTION
  -35, // BLOCKED_IN_INCOGNITO_BY_ADMINISTRATOR
  -301, // DISALLOWED_URL_SCHEME
  -311, // UNSAFE_REDIRECT
  -312, // UNSAFE_PORT
]);

/**
 * OS-level access denied errors (StagemanNoOSResourceAccess)
 */
const OS_ACCESS_DENIED_ERRORS = new Set([
  -10, // ACCESS_DENIED
  -33, // NETWORK_ACCESS_REVOKED
  -138, // NETWORK_ACCESS_DENIED
]);

/**
 * DNS resolution errors (StagemanDnsError)
 * Note: -105 and -137 are in the network range but are DNS-related
 */
const DNS_ERRORS = new Set([
  -105, // NAME_NOT_RESOLVED
  -137, // NAME_RESOLUTION_FAILED
]);

/**
 * Get the appropriate Stageman graphic based on error category and code
 */
const getErrorGraphic = (
  category: ErrorCategory,
  errorCode: number,
): string => {
  // Check specific error codes first (more accurate than category)
  if (USER_ACTION_REQUIRED_ERRORS.has(errorCode)) {
    return StagemanAskingForInput;
  }

  if (TIMEOUT_ERRORS.has(errorCode)) {
    return StagemanSleeping;
  }

  if (BROWSER_POLICY_BLOCKED_ERRORS.has(errorCode)) {
    return StagemanDetectiveStopping;
  }

  if (OS_ACCESS_DENIED_ERRORS.has(errorCode)) {
    return StagemanNoOSResourceAccess;
  }

  if (DNS_ERRORS.has(errorCode)) {
    return StagemanDnsError;
  }

  // Fall back to category-based selection
  switch (category) {
    case 'certificate':
      return StagemanCertError;
    case 'network':
      return StagemanNoConnection;
    case 'dns':
      return StagemanDnsError;
    case 'security':
      return StagemanNoOSResourceAccess;
    case 'cache':
    case 'protocol':
    case 'generic':
    case 'unknown':
    default:
      return StagemanCrash;
  }
};

type PageLoadErrorSearch = {
  errorUrl: string;
  subresourceUrl?: string;
  errorCode: number;
  errorMessage?: string;
  isSubframe?: string;
  tabId: string;
};

export const Route = createFileRoute('/_error-pages/error/page-load-failed')({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): PageLoadErrorSearch => {
    if (!search.errorUrl || !search.errorCode || !search.tabId) {
      throw new Error('Invalid search parameters');
    }

    if (Number.isNaN(Number(search.errorCode))) {
      throw new Error('Invalid error code');
    }

    return {
      errorUrl: search.errorUrl as string,
      subresourceUrl: search.subresourceUrl as string | undefined,
      errorCode: Number(search.errorCode),
      errorMessage: search.errorMessage as string | undefined,
      isSubframe: search.isSubframe as string | undefined,
      tabId: search.tabId as string,
    };
  },
});

function RouteComponent() {
  const { errorUrl, errorCode, errorMessage, subresourceUrl, tabId } =
    useSearch({
      from: '/_error-pages/error/page-load-failed',
    });

  const trustCertificateAndReload = useKartonProcedure(
    (p) => p.trustCertificateAndReload,
  );

  const classification = classifyError(errorCode);
  const errorName = getErrorName(errorCode);

  // Build title and message from classification
  const title = classification.userFriendlyTitle;
  const message = subresourceUrl
    ? `${classification.userFriendlyMessage}\n\nFailed resource: ${subresourceUrl}`
    : classification.userFriendlyMessage;

  // Extract origin from error URL for certificate bypass
  const getOriginFromUrl = (url: string): string | null => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  };

  const handleTrustCertificate = () => {
    const origin = getOriginFromUrl(errorUrl);
    if (origin && tabId) {
      trustCertificateAndReload(tabId, origin);
    }
  };

  const buttonActions = getErrorButtonActions(
    errorUrl,
    classification.category,
    handleTrustCertificate,
  );
  const linkActions = getErrorLinkActions(errorCode);

  return (
    <main className="flex size-full min-h-screen min-w-screen flex-col items-center justify-center bg-background pb-32">
      <ErrorDisplay
        title={title}
        message={message}
        graphic={
          <img
            className="dark: w-full max-w-80 dark:invert-75"
            src={getErrorGraphic(classification.category, errorCode)}
            alt="Stageman"
          />
        }
        errorCode={errorCode}
        errorName={errorMessage ? `${errorName} (${errorMessage})` : errorName}
        url={errorUrl}
        showUrl={true}
        dangerous={classification.isDangerous}
        buttonActions={buttonActions}
        linkActions={linkActions}
      />
    </main>
  );
}

/**
 * Get button actions for the error page.
 * - For certificate errors: "Continue (UNSAFE!)" as primary, then "Go Back"
 * - For other errors: "Try Again" then "Go Back"
 */
const getErrorButtonActions = (
  _errorUrl: string,
  category: ErrorCategory,
  onTrustCertificate?: () => void,
): Required<ErrorDisplayProps['buttonActions']> => {
  // Certificate errors: Continue (UNSAFE!) as primary action, no Try Again
  if (category === 'certificate' && onTrustCertificate) {
    return [
      {
        label: 'Continue (UNSAFE!)',
        onClick: onTrustCertificate,
      },
      {
        label: 'Go Back',
        onClick: () => {
          window.history.back();
        },
      },
    ];
  }

  // Other errors: Try Again and Go Back
  return [
    {
      label: 'Try Again',
      onClick: () => {
        // Trigger reload - TabController will intercept and reload the original URL
        window.location.reload();
      },
    },
    {
      label: 'Go Back',
      onClick: () => {
        window.history.back();
      },
    },
  ];
};

/**
 * Get link actions for additional help options
 */
const getErrorLinkActions = (
  errorCode: number,
): Required<ErrorDisplayProps['linkActions']> => {
  const classification = classifyError(errorCode);
  const links: ErrorDisplayProps['linkActions'] = [];

  // Add context-specific help links based on error category
  if (classification.category === 'certificate') {
    // Certificate errors - could add link to security settings
    // links.push({ label: 'Learn about security certificates', href: '...' });
  } else if (classification.category === 'network') {
    // Network errors - could add link to network troubleshooting
    // links.push({ label: 'Troubleshoot connection issues', href: '...' });
  }

  return links;
};

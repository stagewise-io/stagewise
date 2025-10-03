import type { RouterOutputs } from '@stagewise/api-client';

export function convertCreditsToSubscriptionCredits(
  credits: Awaited<RouterOutputs['chat']['callAgent']['response']>['credits'],
): RouterOutputs['subscription']['getSubscription']['credits'] {
  const totalCredits =
    (credits.regularCredit?.amount ?? 0) +
    credits.specialCredits.reduce((acc, credit) => {
      return acc + credit.amount;
    }, 0);

  const usedCredits =
    (credits.regularCredit?.used_amount ?? 0) +
    credits.specialCredits.reduce((acc, credit) => {
      return acc + credit.used_amount;
    }, 0);

  const availableCredits = totalCredits - usedCredits;

  return {
    total: totalCredits,
    used: usedCredits,
    available: availableCredits,
    regular: {
      total: credits.regularCredit?.amount ?? 0,
      used: credits.regularCredit?.used_amount ?? 0,
      available:
        (credits.regularCredit?.amount ?? 0) -
        (credits.regularCredit?.used_amount ?? 0),
    },
    special: {
      total: credits.specialCredits.reduce((acc, credit) => {
        return acc + credit.amount;
      }, 0),
      used: credits.specialCredits.reduce(
        (acc, credit) => acc + credit.used_amount,
        0,
      ),
      available: credits.specialCredits.reduce(
        (acc, credit) => acc + (credit.amount - credit.used_amount),
        0,
      ),
    },
  };
}

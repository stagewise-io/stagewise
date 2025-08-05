import type { AgentEvent } from '@stagewise/agent-client';
import chalk from 'chalk';

function createCreditStatusBar(available: number, total: number): string {
  const barWidth = 30;
  const percentage = total > 0 ? available / total : 0;
  const filledWidth = Math.round(percentage * barWidth);
  const emptyWidth = barWidth - filledWidth;

  // Use Unicode block characters for the progress bar
  const filledChar = '-';
  const emptyChar = '-';

  // ANSI color codes
  const lightGreen = '\x1b[92m'; // Light green
  const grey = '\x1b[90m'; // Grey
  const reset = '\x1b[0m'; // Reset

  const filledBar = lightGreen + filledChar.repeat(filledWidth) + reset;
  const emptyBar = grey + emptyChar.repeat(emptyWidth) + reset;

  return `[ ${filledBar}${emptyBar} ] ${available}/${total}€`;
}

export function printInfoMessages(event: AgentEvent) {
  switch (event.type) {
    case 'agent_response_received': {
      const credits = event.data.credits;
      const totalCreditData = {
        total:
          (credits.regularCredit?.amount ?? 0) +
          credits.specialCredits.reduce(
            (acc, credit) => acc + credit.amount,
            0,
          ),
        available:
          (credits.regularCredit?.amount ?? 0) -
          (credits.regularCredit?.used_amount ?? 0) +
          credits.specialCredits.reduce(
            (acc, credit) => acc + (credit.amount - credit.used_amount),
            0,
          ),
      };

      const creditInEuros = {
        total: Number((totalCreditData.total / (100 * 100)).toFixed(2)),
        available: Number((totalCreditData.available / (100 * 100)).toFixed(2)),
      };

      const statusBar = createCreditStatusBar(
        creditInEuros.available,
        creditInEuros.total,
      );
      console.log(`Credits: ${statusBar}`);

      // Show CTA if credits are running low (less than 20% remaining)
      const percentage =
        totalCreditData.total > 0
          ? creditInEuros.available / creditInEuros.total
          : 0;
      if (percentage < 0.2 || creditInEuros.available <= 1.5) {
        console.log(
          chalk.grey(
            'Running low on credits? Get more at https://console.stagewise.io',
          ),
        );
      }

      break;
    }
  }
}

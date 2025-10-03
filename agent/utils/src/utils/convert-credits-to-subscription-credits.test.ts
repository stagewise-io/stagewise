import { describe, it, expect } from 'vitest';
import { convertCreditsToSubscriptionCredits } from './convert-credits-to-subscription-credits.js';
import type { RouterOutputs } from '@stagewise/api-client';

type InputCredits = Awaited<
  RouterOutputs['chat']['callAgent']['response']
>['credits'];

describe('convertCreditsToSubscriptionCredits', () => {
  it('should correctly convert credits with both regular and special credits', () => {
    const inputCredits: InputCredits = {
      regularCredit: {
        amount: 1000,
        used_amount: 300,
      },
      specialCredits: [
        {
          amount: 500,
          used_amount: 100,
        },
        {
          amount: 200,
          used_amount: 50,
        },
      ],
    };

    const result = convertCreditsToSubscriptionCredits(inputCredits);

    expect(result).toEqual({
      total: 1700, // 1000 + 500 + 200
      used: 450, // 300 + 100 + 50
      available: 1250, // 1700 - 450
      regular: {
        total: 1000,
        used: 300,
        available: 700, // 1000 - 300
      },
      special: {
        total: 700, // 500 + 200
        used: 150, // 100 + 50
        available: 550, // (500-100) + (200-50) = 400 + 150
      },
    });
  });

  it('should handle undefined regular credit correctly', () => {
    const inputCredits: InputCredits = {
      regularCredit: undefined,
      specialCredits: [
        {
          amount: 500,
          used_amount: 100,
        },
      ],
    };

    const result = convertCreditsToSubscriptionCredits(inputCredits);

    expect(result).toEqual({
      total: 500,
      used: 100,
      available: 400,
      regular: {
        total: 0,
        used: 0,
        available: 0,
      },
      special: {
        total: 500,
        used: 100,
        available: 400,
      },
    });
  });

  it('should handle empty special credits array', () => {
    const inputCredits: InputCredits = {
      regularCredit: {
        amount: 1000,
        used_amount: 200,
      },
      specialCredits: [],
    };

    const result = convertCreditsToSubscriptionCredits(inputCredits);

    expect(result).toEqual({
      total: 1000,
      used: 200,
      available: 800,
      regular: {
        total: 1000,
        used: 200,
        available: 800,
      },
      special: {
        total: 0,
        used: 0,
        available: 0,
      },
    });
  });

  it('should handle no credits scenario', () => {
    const inputCredits: InputCredits = {
      regularCredit: undefined,
      specialCredits: [],
    };

    const result = convertCreditsToSubscriptionCredits(inputCredits);

    expect(result).toEqual({
      total: 0,
      used: 0,
      available: 0,
      regular: {
        total: 0,
        used: 0,
        available: 0,
      },
      special: {
        total: 0,
        used: 0,
        available: 0,
      },
    });
  });

  it('should handle fully used credits', () => {
    const inputCredits: InputCredits = {
      regularCredit: {
        amount: 500,
        used_amount: 500,
      },
      specialCredits: [
        {
          amount: 300,
          used_amount: 300,
        },
      ],
    };

    const result = convertCreditsToSubscriptionCredits(inputCredits);

    expect(result).toEqual({
      total: 800,
      used: 800,
      available: 0,
      regular: {
        total: 500,
        used: 500,
        available: 0,
      },
      special: {
        total: 300,
        used: 300,
        available: 0,
      },
    });
  });

  it('should handle unused credits', () => {
    const inputCredits: InputCredits = {
      regularCredit: {
        amount: 1000,
        used_amount: 0,
      },
      specialCredits: [
        {
          amount: 500,
          used_amount: 0,
        },
        {
          amount: 200,
          used_amount: 0,
        },
      ],
    };

    const result = convertCreditsToSubscriptionCredits(inputCredits);

    expect(result).toEqual({
      total: 1700,
      used: 0,
      available: 1700,
      regular: {
        total: 1000,
        used: 0,
        available: 1000,
      },
      special: {
        total: 700,
        used: 0,
        available: 700,
      },
    });
  });

  it('should handle multiple special credits with varying usage', () => {
    const inputCredits: InputCredits = {
      regularCredit: {
        amount: 2000,
        used_amount: 1500,
      },
      specialCredits: [
        {
          amount: 1000,
          used_amount: 0, // Unused
        },
        {
          amount: 500,
          used_amount: 500, // Fully used
        },
        {
          amount: 300,
          used_amount: 150, // Partially used
        },
      ],
    };

    const result = convertCreditsToSubscriptionCredits(inputCredits);

    expect(result).toEqual({
      total: 3800, // 2000 + 1000 + 500 + 300
      used: 2150, // 1500 + 0 + 500 + 150
      available: 1650, // 3800 - 2150
      regular: {
        total: 2000,
        used: 1500,
        available: 500,
      },
      special: {
        total: 1800, // 1000 + 500 + 300
        used: 650, // 0 + 500 + 150
        available: 1150, // 1000 + 0 + 150
      },
    });
  });

  it('should handle regular credit with missing used_amount', () => {
    const inputCredits: InputCredits = {
      regularCredit: {
        amount: 1000,
        used_amount: undefined as any, // Type cast for testing edge case
      },
      specialCredits: [
        {
          amount: 500,
          used_amount: 100,
        },
      ],
    };

    const result = convertCreditsToSubscriptionCredits(inputCredits);

    expect(result).toEqual({
      total: 1500,
      used: 100, // Only special credit used amount
      available: 1400,
      regular: {
        total: 1000,
        used: 0, // undefined used_amount defaults to 0
        available: 1000,
      },
      special: {
        total: 500,
        used: 100,
        available: 400,
      },
    });
  });
});

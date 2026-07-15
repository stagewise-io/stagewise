import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui/hooks/use-karton', () => ({
  useKartonState: vi.fn(),
  useKartonProcedure: vi.fn(),
}));
vi.mock('@ui/hooks/use-track', () => ({ useTrack: vi.fn() }));

import { TruncatedErrorText } from './06-configure-providers';

describe('TruncatedErrorText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reveals a truncated error after keyboard focus', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);

    render(<TruncatedErrorText text="The provider connection failed" />);

    const trigger = screen.getByRole('button', {
      name: 'The provider connection failed',
    });
    expect(trigger.getAttribute('tabindex')).toBe('0');
    expect(screen.getAllByText('The provider connection failed')).toHaveLength(
      1,
    );

    fireEvent.focus(trigger);

    expect(screen.getAllByText('The provider connection failed')).toHaveLength(
      2,
    );

    fireEvent.blur(trigger);
    expect(screen.getAllByText('The provider connection failed')).toHaveLength(
      1,
    );
  });

  it('does not add a tab stop when the error fits', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);

    render(<TruncatedErrorText text="Connection failed" />);

    expect(screen.getByRole('button').getAttribute('tabindex')).toBe('-1');
  });
});

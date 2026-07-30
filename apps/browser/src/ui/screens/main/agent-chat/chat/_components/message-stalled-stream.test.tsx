import { act, render, screen } from '@testing-library/react';
import type { TextUIPart } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MessageStalledStream,
  STALLED_STREAM_MESSAGE,
} from './message-stalled-stream';

const createStreamingParts = (text: string): TextUIPart[] => [
  { type: 'text', text, state: 'streaming' },
];

describe('MessageStalledStream', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('appears after five quiet seconds and resets on the next chunk', () => {
    const initialParts = createStreamingParts('Partial');
    const { rerender } = render(<MessageStalledStream parts={initialParts} />);

    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.queryByText(STALLED_STREAM_MESSAGE)).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(STALLED_STREAM_MESSAGE)).toBeTruthy();

    const updatedParts = createStreamingParts('Partial response');
    rerender(<MessageStalledStream parts={updatedParts} />);
    expect(screen.queryByText(STALLED_STREAM_MESSAGE)).toBeNull();

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText(STALLED_STREAM_MESSAGE)).toBeTruthy();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./rich-text/attachments', () => ({
  AttachmentRegistryNodeView: () => null,
  ElementAttachmentView: () => null,
}));
vi.mock('./rich-text/mentions', () => ({ MentionNodeView: () => null }));
vi.mock('./rich-text/slash/slash-node-view', () => ({
  SlashNodeView: () => null,
}));

import { ChatInputViewOnly } from './chat-input-view-only';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe('ChatInputViewOnly', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not render a toggle when the message fits', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(174);

    render(<ChatInputViewOnly tipTapContent="Short message" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('toggles overflowing content without triggering the message action', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(175);
    const onEdit = vi.fn();

    render(<ChatInputViewOnly tipTapContent="Long message" onEdit={onEdit} />);

    const showMoreButton = screen.getByRole('button', { name: 'Show more' });
    expect(showMoreButton.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(showMoreButton);

    const showLessButton = screen.getByRole('button', { name: 'Show less' });
    expect(showLessButton.getAttribute('aria-expanded')).toBe('true');
    expect(onEdit).not.toHaveBeenCalled();

    const messageButton = screen.getByRole('button', { name: 'Long message' });
    fireEvent.click(messageButton);
    expect(onEdit).toHaveBeenCalledOnce();

    fireEvent.keyDown(messageButton, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledTimes(2);

    fireEvent.click(showLessButton);
    expect(
      screen
        .getByRole('button', { name: 'Show more' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });
});

'use client';

import { useEffect, useState } from 'react';

interface AnimatedPopoverProps {
  onClose: () => void;
}

export  function ToggleButton() {
  const [isActive, setIsActive] = useState(false);
  const [showBorder, setShowBorder] = useState(true);

  return (
    <div className="relative">
      <button
        id="toggle-button"
        type="button"
        onClick={() => setIsActive(!isActive)}
        className={`transition-all duration-300 ease-in-out ${
          isActive
            ? 'bg-blue-500 px-6 py-3 text-white'
            : 'rounded-full bg-black px-8 py-3 text-white'
        } font-medium ring-2 ring-blue-500 ring-offset-2 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
      >
        {isActive ? 'Active State' : 'Default State'}
      </button>
      <AnimatedPopover onClose={() => {}} />
    </div>
  );
}


export function AnimatedPopover({ onClose }: AnimatedPopoverProps) {
  const [text, setText] = useState('');
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = [
    'make the button rounded and blue',
    'make the button black and remove the corner radius',
  ];
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.5 },
    );

    const button = document.querySelector('#toggle-button');
    if (button) {
      observer.observe(button);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < messages[messageIndex].length) {
        setText(messages[messageIndex].slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(interval);
        // Start loading state after typing is complete
        setIsLoading(true);
        setTimeout(() => {
          setIsSubmitted(true);
          // Change button state
          const button = document.querySelector(
            '#toggle-button',
          ) as HTMLButtonElement;
          if (button) {
            button.click();
          }
          // Hide popover after 500ms
          setTimeout(() => {
            setIsVisible(false);
            onClose();
            // Reset states and show next message after 2 seconds
            setTimeout(() => {
              setMessageIndex((prev) => (prev + 1) % messages.length);
              setText('');
              setIsSubmitted(false);
              setIsLoading(false);
              setIsVisible(true);
            }, 1000);
          }, 500);
        }, 2000);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isVisible, onClose, messageIndex]);

  if (isSubmitted) return null;

  return (
    <div className="-translate-y-1/2 absolute top-1/2 left-full z-10 ml-4">
      <div className="h-20 w-xs rounded-lg bg-white p-4 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div className="w-full font-mono text-gray-700 text-sm">
            {text}
            <span className="animate-pulse">|</span>
          </div>
          <button
            type="button"
            className={`flex h-6 w-6 items-center justify-center rounded-full p-1 transition-colors ${
              text === messages[messageIndex]
                ? isLoading
                  ? 'bg-blue-100'
                  : 'bg-blue-500'
                : 'bg-blue-500'
            }`}
            disabled={text !== messages[messageIndex] || isLoading}
          >
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            ) : (
              <svg
                className="h-4 w-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

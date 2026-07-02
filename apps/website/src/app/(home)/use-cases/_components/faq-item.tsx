'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@stagewise/stage-ui/lib/utils';

interface FaqItemProps {
  index: number;
  question: string;
  answer: React.ReactNode;
}

export function FaqItem({ index, question, answer }: FaqItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerId = `faq-trigger-${index}`;
  const contentId = `faq-content-${index}`;

  return (
    <div className="overflow-hidden rounded-xl border border-surface-2 bg-surface-1/50 transition-colors duration-200">
      <h3 className="m-0 flex">
        <button
          id={triggerId}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex w-full items-center justify-between px-6 py-5 text-left font-medium text-foreground transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <span className="pr-4 text-base md:text-lg">{question}</span>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300',
              isOpen && 'rotate-180 text-foreground',
            )}
          />
        </button>
      </h3>
      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        inert={!isOpen}
        className={cn(
          'grid transition-all duration-300 ease-in-out',
          isOpen
            ? 'grid-rows-[1fr] border-surface-2 border-t opacity-100'
            : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-6 py-5 text-muted-foreground text-sm leading-relaxed md:text-base [&>p+p]:mt-4">
            {answer}
          </div>
        </div>
      </div>
    </div>
  );
}

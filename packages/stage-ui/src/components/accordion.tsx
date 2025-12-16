import { cn } from '../lib/utils';
import { Accordion as BaseAccordion } from '@base-ui/react/accordion';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type AccordionProps = React.ComponentProps<typeof BaseAccordion.Root> & {
  variant?: 'clear' | 'glass';
};

export function Accordion({ variant = 'glass', ...props }: AccordionProps) {
  return (
    <BaseAccordion.Root
      {...props}
      className={cn(
        variant === 'glass' ? 'glass-body overflow-hidden rounded-xl' : '',
        props.className,
      )}
    />
  );
}

export type AccordionItemProps = React.ComponentProps<
  typeof BaseAccordion.Item
> & {
  title: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
};

export function AccordionItem({
  title,
  icon,
  children,
  ...props
}: AccordionItemProps) {
  return (
    <BaseAccordion.Item
      {...props}
      className={cn(
        'border-foreground/15 border-b text-foreground shadow-none hover:bg-foreground/3',
        props.className,
      )}
    >
      <BaseAccordion.Header>
        <BaseAccordion.Trigger className="group flex w-full flex-row items-center justify-between gap-4 bg-background/10 px-3 py-2 transition-colors duration-150 ease-out hover:bg-background/20">
          {icon && <div className="size-5">{icon}</div>}
          <div className="block flex-1 text-start font-medium">{title}</div>
          <ChevronDownIcon className="size-4 origin-center rotate-0 opacity-40 transition-transform duration-150 ease-out group-hover:opacity-60 group-data-[panel-open]:rotate-180" />
        </BaseAccordion.Trigger>
      </BaseAccordion.Header>
      <BaseAccordion.Panel className="h-[var(--accordion-panel-height)] px-3 pt-1.5 pb-3 transition-[height] duration-150 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0">
        {children}
      </BaseAccordion.Panel>
    </BaseAccordion.Item>
  );
}

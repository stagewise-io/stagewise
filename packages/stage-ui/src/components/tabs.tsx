import { Tabs as TabsBase } from '@base-ui-components/react/tabs';
import { cn } from '../lib/utils';
import { buttonVariants } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export type TabsProps = React.ComponentProps<typeof TabsBase.Root>;
export const Tabs = ({ className, ...props }: TabsProps) => {
  return (
    <TabsBase.Root
      {...props}
      className={cn('flex flex-col items-start gap-6', className)}
    />
  );
};

export type TabsListProps = React.ComponentProps<typeof TabsBase.List>;
export const TabsList = ({ className, children, ...props }: TabsListProps) => {
  return (
    <TabsBase.List
      {...props}
      className={cn(
        '-ml-0.5 glass-inset flex w-auto shrink-0 flex-row items-center justify-between gap-2 overflow-hidden rounded-full p-1',
        className,
      )}
    >
      {children}
    </TabsBase.List>
  );
};

export type TabsTriggerProps = Omit<
  React.ComponentProps<typeof TabsBase.Tab>,
  'children'
> & {
  icon?: React.ReactNode;
  title: string | React.ReactNode;
};
export const TabsTrigger = ({
  className,
  icon,
  title,
  ...props
}: TabsTriggerProps) => {
  return (
    <Tooltip>
      <TooltipTrigger>
        <TabsBase.Tab
          {...props}
          className={(state) =>
            cn(
              buttonVariants({
                variant: state.selected ? 'primary' : 'ghost',
                size: state.selected ? 'md' : 'icon-md',
              }),
              'group/tabstab w-[calc-size(auto,size)] min-w-10 rounded-full transition-all duration-200 ease-out',
              className,
            )
          }
        >
          {icon}
          {title && (
            <span
              className={cn(
                'w-0 overflow-hidden whitespace-nowrap group-data-selected/tabstab:w-auto',
              )}
            >
              {title}
            </span>
          )}
        </TabsBase.Tab>
      </TooltipTrigger>
      <TooltipContent>{title as string}</TooltipContent>
    </Tooltip>
  );
};

export type TabsContentProps = React.ComponentProps<typeof TabsBase.Panel>;
export const TabsContent = ({ className, ...props }: TabsContentProps) => {
  return (
    <TabsBase.Panel
      {...props}
      className={cn(
        'data-hidden:data-[activation-direction=right]:-translate-x-10 data-[starting-style]:data-[activation-direction=left]:-translate-x-4 data-[ending-style]:data-[activation-direction=right]:-translate-x-4 transition-all duration-300 ease-out data-[ending-style]:data-[activation-direction=left]:translate-x-4 data-[starting-style]:data-[activation-direction=right]:translate-x-4 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[ending-style]:blur-sm data-[starting-style]:blur-sm',
        className,
      )}
    />
  );
};

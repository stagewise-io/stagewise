import { cn } from '@/utils';
import type { ComponentChildren } from 'preact';

function PluginBox({ children }: { children: ComponentChildren }) {
  return (
    <section className="flex h-full max-h-auto max-h-full min-h-48 w-auto flex-col items-center justify-center rounded-2xl border border-border/30 bg-white/80 p-4 backdrop-blur-md">
      {children}
    </section>
  );
}

function PluginBoxHeader({
  title,
  description,
}: { title?: string; description?: string }) {
  return (
    <header className="mb-3 flex w-full flex-col gap-1 bg-white text-zinc-950">
      {title && <h3 className="font-semibold text-lg ">{title}</h3>}
      {description && (
        <p className="font-medium text-zinc-600">{description}</p>
      )}
    </header>
  );
}

function PluginBoxContent({ children }: { children: ComponentChildren }) {
  return (
    <div className="-mx-4 flex flex-1 flex-col gap-2 overflow-y-auto border-border/30 border-t px-4 pt-4 text-zinc-950">
      {children}
    </div>
  );
}

function PluginBoxFooter({ children }: { children: ComponentChildren }) {
  return (
    <footer className="flex flex-row items-end justify-end gap-2 text-sm text-zinc-600">
      {children}
    </footer>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  style: 'primary' | 'secondary' | 'outline' | 'ghost';
  size: 'sm' | 'md' | 'lg';
  onClick: () => void;
  asChild?: boolean;
  disabled?: boolean;
}

function Button({
  children,
  style,
  size,
  onClick,
  asChild,
  disabled,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <button
        {...props}
        onClick={onClick}
        disabled={disabled}
        className="cursor-pointer"
      >
        {children}
      </button>
    );
  }
  return (
    <button
      {...props}
      onClick={onClick}
      className={cn(
        'flex h-12 cursor-pointer items-center justify-center rounded-md p-2 text-white',
        size === 'sm' && 'h-8',
        size === 'md' && 'h-12',
        size === 'lg' && 'h-16',
        style === 'primary' && 'bg-blue-500',
        style === 'secondary' && 'bg-gray-500',
        style === 'outline' && 'border border-blue-500 bg-white text-blue-500',
        style === 'ghost' && 'bg-transparent text-blue-500',
      )}
      type="submit"
      disabled={disabled}
    >
      {children}
    </button>
  );
}

interface BadgeProps {
  children: ComponentChildren;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange' | 'pink';
  style: 'default' | 'outline';
}

function Badge({ children, color, style }: BadgeProps) {
  return (
    <span
      className={cn(
        'rounded-md p-2 text-white',
        style === 'default' && {
          'bg-blue-500': color === 'blue',
          'bg-green-500': color === 'green',
          'bg-red-500': color === 'red',
          'bg-yellow-500': color === 'yellow',
          'bg-purple-500': color === 'purple',
          'bg-orange-500': color === 'orange',
          'bg-pink-500': color === 'pink',
        },
        style === 'outline' && {
          'border border-blue-500 text-zinc-950': color === 'blue',
          'border border-green-500 text-zinc-950': color === 'green',
          'border border-red-500 text-zinc-950': color === 'red',
          'border border-yellow-500 text-zinc-950': color === 'yellow',
          'border border-purple-500 text-zinc-950': color === 'purple',
          'border border-orange-500 text-zinc-950': color === 'orange',
          'border border-pink-500 text-zinc-950': color === 'pink',
        },
      )}
    >
      {children}
    </span>
  );
}

export {
  PluginBox,
  PluginBox as Panel,
  PluginBoxHeader,
  PluginBoxHeader as Header,
  PluginBoxContent,
  PluginBoxContent as Content,
  PluginBoxFooter,
  PluginBoxFooter as Footer,
  Button,
  Badge,
};

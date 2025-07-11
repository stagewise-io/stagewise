import { cn } from '@/utils';

export const glassyBoxClassName = `
  z-0
  before:absolute before:content-normal before:size-full before:inset-0 before:border before:border-zinc-950/20 before:ring-inset before:ring-[1.5px] before:ring-white/30 before:backdrop-blur-sm before:-z-20 before:bg-white/85 before:rounded-[inherit]
  after:absolute after:pointer-events-none after:rounded-[inherit] after:block after:size-full after:inset-0 after:shadow-glass
`;
export interface GlassyProps<Component extends React.ElementType = 'div'> {
  as?: Component;
  className?: string;
  ref?: React.Ref<any>;
  children?: React.ReactNode;
}

export function Glassy<Component extends React.ElementType = 'div'>({
  className,
  as,
  ref,
  children,
  ...props
}: GlassyProps<Component> &
  Omit<React.ComponentProps<Component>, keyof GlassyProps<Component>>) {
  const CompType = as || 'div';
  return (
    <CompType
      ref={ref}
      className={cn(glassyBoxClassName, className)}
      {...props}
    >
      <div className="-z-10 pointer-events-none absolute inset-0 flex size-full items-center justify-center overflow-hidden rounded-[inherit]">
        <div className="size-full min-h-48 min-w-48 bg-[image:var(--glass-texture)] bg-center bg-cover bg-no-repeat opacity-30" />
      </div>
      {children}
    </CompType>
  );
}

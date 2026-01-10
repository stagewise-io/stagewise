import { cn } from '@/utils';

type PulsatingCircleProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

export function PulsatingCircle({
  className,
  size = 'md',
}: PulsatingCircleProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div
      className={cn('rounded-full bg-primary', sizeClasses[size], className)}
      style={{
        animation: 'pulse-scale 1s ease-in-out infinite',
      }}
    >
      <style>
        {`
          @keyframes pulse-scale {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.15);
            }
          }
        `}
      </style>
    </div>
  );
}

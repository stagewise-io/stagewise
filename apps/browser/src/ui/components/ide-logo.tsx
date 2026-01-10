import { IDE_LOGOS } from '@/assets/ide-logos';
import { FileIcon } from 'lucide-react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';

export const IdeLogo = ({
  ide,
  className,
}: {
  ide: OpenFilesInIde;
  className?: string;
}) => {
  return ide === 'other' ? (
    <FileIcon className={cn('size-3 shrink-0', className)} />
  ) : (
    <img
      src={IDE_LOGOS[ide]}
      alt={ide}
      className={cn('size-3 shrink-0', className)}
    />
  );
};

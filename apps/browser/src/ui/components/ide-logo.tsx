import { IDE_LOGOS } from '@ui/assets/ide-logos';
import { IconFolderContent2FillDuo18 } from '@stagewise/icons';
import { IconFinderFillDuo18 } from '@stagewise/icons';
import { cn } from '@stagewise/stage-ui/lib/utils';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';
import { getCurrentPlatform } from '@shared/hotkeys';

const isMac = getCurrentPlatform() === 'mac';

const NativeFileManagerIcon = isMac
  ? IconFinderFillDuo18
  : IconFolderContent2FillDuo18;

export const IdeLogo = ({
  ide,
  className,
}: {
  ide: OpenFilesInIde;
  className?: string;
}) => {
  return ide === 'other' ? (
    <NativeFileManagerIcon className={cn('size-3 shrink-0', className)} />
  ) : (
    <img
      src={IDE_LOGOS[ide]}
      alt={ide}
      className={cn(
        'size-3 shrink-0',
        (ide === 'windsurf' || ide === 'zed') && 'dark:invert',
        (ide === 'trae' || ide === 'kiro' || ide === 'vscode') &&
          'grayscale dark:invert',
        className,
      )}
    />
  );
};

import { useState, useEffect, useRef, type FC } from 'react';
import { IconDatabaseFillDuo18 } from '@stagewise/icons';
import { IconArrowRightFill18 } from '@stagewise/icons';
import { useKartonProcedure } from '@pages/hooks/use-karton';
import type { ExternalFileDiff } from '@shared/karton-contracts/ui/shared-types';
import type { ExternalFileContentResult } from '@shared/karton-contracts/pages-api/types';
import { ImagePreview } from './image-preview';
import { FontPreview } from './font-preview';
import { isImageFile, isFontFile } from '@ui/utils/file-type-utils';

function useFileContent(
  oid: string | null,
  getContent: (oid: string) => Promise<ExternalFileContentResult | null>,
) {
  const [base64Content, setBase64Content] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getContentRef = useRef(getContent);
  getContentRef.current = getContent;

  useEffect(() => {
    if (!oid) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getContentRef
      .current(oid)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setBase64Content(result.content);
          setMimeType(result.mimeType);
        } else {
          setError('Content not found');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [oid]);

  return { base64Content, mimeType, isLoading, error };
}

type ExternalFilePreviewProps = {
  fileDiff: ExternalFileDiff;
};

export const ExternalFilePreview: FC<ExternalFilePreviewProps> = ({
  fileDiff,
}) => {
  const getExternalFileContent = useKartonProcedure(
    (p) => p.getExternalFileContent,
  );

  const isImage = isImageFile(fileDiff.path);
  const isFont = isFontFile(fileDiff.path);
  const { changeType, baselineOid, currentOid } = fileDiff;

  const baselineContent = useFileContent(baselineOid, getExternalFileContent);
  const currentContent = useFileContent(currentOid, getExternalFileContent);

  if (isImage) {
    return (
      <div className="p-4">
        {changeType === 'created' && (
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <ImagePreview
                base64Content={currentContent.base64Content}
                mimeType={currentContent.mimeType}
                filePath={fileDiff.path}
                isLoading={currentContent.isLoading}
                error={currentContent.error}
              />
            </div>
          </div>
        )}

        {changeType === 'deleted' && (
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <ImagePreview
                base64Content={baselineContent.base64Content}
                mimeType={baselineContent.mimeType}
                filePath={fileDiff.path}
                isLoading={baselineContent.isLoading}
                error={baselineContent.error}
              />
            </div>
          </div>
        )}

        {changeType === 'modified' && (
          <div className="flex items-center justify-center gap-8">
            <ImagePreview
              base64Content={baselineContent.base64Content}
              mimeType={baselineContent.mimeType}
              filePath={fileDiff.path}
              isLoading={baselineContent.isLoading}
              error={baselineContent.error}
            />
            <IconArrowRightFill18 className="size-4 text-muted-foreground" />
            <ImagePreview
              base64Content={currentContent.base64Content}
              mimeType={currentContent.mimeType}
              filePath={fileDiff.path}
              isLoading={currentContent.isLoading}
              error={currentContent.error}
            />
          </div>
        )}
      </div>
    );
  }

  if (isFont) {
    return (
      <div className="p-4">
        {changeType === 'created' && (
          <FontPreview
            base64Content={currentContent.base64Content}
            mimeType={currentContent.mimeType}
            filePath={fileDiff.path}
            isLoading={currentContent.isLoading}
            error={currentContent.error}
          />
        )}

        {changeType === 'deleted' && (
          <FontPreview
            base64Content={baselineContent.base64Content}
            mimeType={baselineContent.mimeType}
            filePath={fileDiff.path}
            isLoading={baselineContent.isLoading}
            error={baselineContent.error}
          />
        )}

        {changeType === 'modified' && (
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 text-muted-foreground text-xs">Before</div>
              <FontPreview
                base64Content={baselineContent.base64Content}
                mimeType={baselineContent.mimeType}
                filePath={fileDiff.path}
                isLoading={baselineContent.isLoading}
                error={baselineContent.error}
              />
            </div>
            <div className="flex justify-center">
              <IconArrowRightFill18 className="size-4 rotate-90 text-muted-foreground" />
            </div>
            <div>
              <div className="mb-2 text-muted-foreground text-xs">After</div>
              <FontPreview
                base64Content={currentContent.base64Content}
                mimeType={currentContent.mimeType}
                filePath={fileDiff.path}
                isLoading={currentContent.isLoading}
                error={currentContent.error}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <IconDatabaseFillDuo18 className="size-12" />
        <span className="font-normal text-muted-foreground text-xs">
          Binary file
        </span>
      </div>
    </div>
  );
};

import { FileQuestionIcon } from 'lucide-react';
import { getProviderIcon } from './providers';

export function MentionIcon({
  providerType,
  id,
  className,
}: {
  providerType: string;
  id: string;
  className?: string;
}) {
  const Icon = getProviderIcon(providerType);
  if (Icon) return <Icon id={id} className={className} />;
  return <FileQuestionIcon className={className} />;
}

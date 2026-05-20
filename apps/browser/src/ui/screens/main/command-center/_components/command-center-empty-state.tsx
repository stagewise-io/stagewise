export function CommandCenterEmptyState({
  isLoading,
}: {
  isLoading?: boolean;
}) {
  return (
    <div className="px-3 py-6 text-center text-muted-foreground text-xs">
      {isLoading ? 'Loading…' : 'No results'}
    </div>
  );
}

import { UserStatusArea } from './user-status';

export function FooterBar() {
  return (
    <div className="flex min-h-0 flex-row items-stretch justify-between rounded-full pt-1">
      {/* Lower left control area */}
      <div className="flex flex-1 basis-1/3 flex-row items-center justify-start" />

      {/* Lower right status area */}
      <div className="flex flex-1 basis-1/3 flex-row items-center justify-end gap-2">
        <UserStatusArea />
      </div>
    </div>
  );
}

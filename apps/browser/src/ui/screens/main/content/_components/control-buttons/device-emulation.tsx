import type { TabState } from '@shared/karton-contracts/ui';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { MonitorSmartphoneIcon } from 'lucide-react';
import { DEFAULT_DEVICE_EMULATION } from '../device-emulation-presets';

export function DeviceEmulationWidget({ tab }: { tab: TabState }) {
  const setDeviceEmulation = useKartonProcedure(
    (procedures) => procedures.browser.setDeviceEmulation,
  );
  const isEnabled = tab.deviceEmulation !== null;
  const label = isEnabled ? 'Hide device toolbar' : 'Show device toolbar';

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={() =>
            setDeviceEmulation(
              isEnabled ? null : DEFAULT_DEVICE_EMULATION,
              tab.id,
            )
          }
          className="text-muted-foreground data-[active=true]:text-primary-solid data-[active=true]:hover:text-primary-solid"
          data-active={isEnabled ? 'true' : 'false'}
        >
          <MonitorSmartphoneIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

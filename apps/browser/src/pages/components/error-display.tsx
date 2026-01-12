import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { IconTriangleWarningFillDuo18 } from 'nucleo-ui-fill-duo-18';
import { cn } from '@/utils';

export interface ErrorDisplayProps {
  // A image or icon that is shown in the upper right corner of the error display
  graphic?: React.ReactNode;

  // The title of the error display
  title: string;

  // The message of the error display
  message: string;

  // The error code of the error display.
  errorCode?: number;

  // The internal error name of the error display.
  errorName?: string;

  // The URL of the page that resulted in the error.
  url?: string;

  // Whether to show the URL of the page that resulted in the error.
  showUrl?: boolean;

  // Whether to show a danger warning icon and color theme. Should only be used if special attention from the user is needed!
  dangerous?: boolean;

  // A list of actions that will be displayed as links below the error body. Put actions with more complex descriptions here
  linkActions?: ({
    label: string;
  } & (
    | {
        onClick: () => void;
      }
    | {
        href?: string;
      }
  ))[];

  // A list of actions that will be displayed as buttons below the error body. Keep labels short.
  buttonActions?: ({
    label: string | React.ReactNode;
  } & (
    | {
        onClick: () => void;
      }
    | {
        href?: string;
      }
  ))[];
}

export function ErrorDisplay(props: ErrorDisplayProps) {
  return (
    <div className="flex w-full max-w-lg flex-col items-stretch justify-center gap-6">
      <div className="items-bottom flex flex-row-reverse items-end justify-between gap-6 fill-base-500">
        {props.graphic ?? <div />}
        {
          <IconTriangleWarningFillDuo18
            className={cn(props.dangerous ? 'size-24 text-red-600' : 'size-16')}
          />
        }
      </div>
      <div className="mb-4 flex flex-col items-stretch justify-center gap-2">
        <h1 className="font-medium text-2xl text-foreground">{props.title}</h1>
        <p className="text-base text-muted-foreground">{props.message}</p>
      </div>
      {(props.errorCode || props.errorName) && (
        <span className="font-mono text-muted-foreground text-sm">
          {props.errorCode}
          {props.errorCode && props.errorName && ': '}
          {props.errorName}
        </span>
      )}

      {(props.linkActions?.length ?? 0) > 0 && (
        <div className="flex flex-col items-start gap-2 *:cursor-pointer *:text-sm *:text-underline *:hover:opacity-80">
          {props.linkActions?.map((action) =>
            'onClick' in action ? (
              <button key={action.label} type="button" onClick={action.onClick}>
                {action.label}
              </button>
            ) : (
              <a key={action.href} href={action.href}>
                {action.label}
              </a>
            ),
          )}
        </div>
      )}

      <div className="flex w-full flex-row-reverse items-center justify-start gap-2">
        {props.buttonActions?.map((action, index) =>
          'onClick' in action ? (
            <Button
              key={`button-click-${String(action.label)}`}
              variant={
                index === 0
                  ? props.dangerous
                    ? 'destructive'
                    : 'primary'
                  : 'secondary'
              }
              size="md"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ) : (
            <a
              key={`button-href-${action.href}`}
              href={action.href}
              className={buttonVariants({
                variant:
                  index === 0
                    ? props.dangerous
                      ? 'destructive'
                      : 'primary'
                    : 'secondary',
                size: 'md',
              })}
            >
              {action.label}
            </a>
          ),
        )}
      </div>
    </div>
  );
}

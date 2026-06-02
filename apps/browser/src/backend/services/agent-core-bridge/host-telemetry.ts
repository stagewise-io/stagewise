import type { Logger, TelemetrySink } from '@stagewise/agent-core';
import type { TelemetryService, UIEventName } from '@/services/telemetry';

export interface CreateBrowserTelemetrySinkOptions {
  /**
   * Optional logger used to record swallowed telemetry errors at
   * `debug` level. Avoids turning telemetry drops into process-level
   * noise while still leaving a breadcrumb for diagnosis.
   */
  logger?: Logger;
}

/**
 * Thin `TelemetrySink` adapter over the browser's `TelemetryService`.
 *
 * `TelemetryService.capture` is strictly typed against
 * `UIEventName`/`EventProperties`; unknown event names would cause
 * TypeScript to widen to `never` and the runtime schema validator to
 * drop the event. The sink therefore coerces its loose inputs to the
 * strict signature via `as never` and wraps the call in a try/catch so
 * unexpected runtime rejections never crash an agent-core caller.
 *
 * `captureException` is structurally compatible and delegated directly.
 */
export function createBrowserTelemetrySink(
  telemetryService: TelemetryService,
  options: CreateBrowserTelemetrySinkOptions = {},
): TelemetrySink {
  const { logger } = options;
  // The `level` field on `TelemetrySink` is `readonly` but resolved
  // through a getter so agent-core observes the user's live preference
  // (mirrors the previous behavior of reading `telemetryLevel` directly
  // before logger/telemetry/modelCatalog were folded onto the
  // `AgentHost`).
  return {
    get level(): 'minimum' | 'full' {
      return telemetryService.telemetryLevel === 'full' ? 'full' : 'minimum';
    },
    capture(eventName, properties) {
      try {
        telemetryService.capture(eventName as UIEventName, properties as never);
      } catch (error) {
        logger?.debug(
          `[BrowserTelemetrySink] dropped event "${eventName}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    captureException(error, properties) {
      try {
        telemetryService.captureException(error, properties);
      } catch (innerError) {
        logger?.debug(
          `[BrowserTelemetrySink] captureException failed: ${
            innerError instanceof Error
              ? innerError.message
              : String(innerError)
          }`,
        );
      }
    },
  };
}

export interface TutorialStep {
  /** CSS selector for the DOM element to highlight */
  targetSelector: string;
  /** Step title shown in the popover */
  title: string;
  /** Step description in markdown format */
  description: string;
}

export interface TutorialDefinition {
  /** Unique identifier for this tutorial (e.g. "command-center") */
  id: string;
  /**
   * Content version. Persisted progress is keyed by id + version, so bump
   * this whenever steps are reordered, inserted, or removed — otherwise
   * users with stale step indices would resume at the wrong step.
   */
  version: number;
  /** Ordered list of steps */
  steps: readonly TutorialStep[];
  /**
   * Display priority when multiple tutorials are queued.
   * Lower values are shown first. Defaults to lowest priority.
   */
  priority?: number;
}

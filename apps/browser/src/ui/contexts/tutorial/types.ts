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
  /** Ordered list of steps */
  steps: TutorialStep[];
}

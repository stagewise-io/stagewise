import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';
import {
  Radio,
  RadioGroup,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { ChevronDownIcon, CornerDownLeftIcon, XIcon } from 'lucide-react';
import { cn } from '@ui/utils';
import { Streamdown, InlineMarkdown } from '@ui/components/streamdown';
import type { StatusCardSection } from './shared';
import type {
  QuestionField,
  QuestionAnswerValue,
} from '@shared/karton-contracts/ui/agent/tools/types';
import type { PendingUserQuestion } from '@shared/karton-contracts/ui/index';
import { dispatchArrowFromCtrl } from '@ui/utils/keyboard-nav';
import { IconHelpChatOutline18 } from 'nucleo-ui-outline-18';

/**
 * Module-level store for the current form draft answers.
 * Read by panel-footer when interrupting the question with a user message.
 * Only one agent form is visible at a time, so a single global is sufficient.
 */
let _draftAnswers: Record<string, QuestionAnswerValue> = {};
export function getCurrentDraftAnswers(): Record<string, QuestionAnswerValue> {
  return { ..._draftAnswers };
}

export interface UserQuestionSectionProps {
  pendingQuestion: PendingUserQuestion | null;
  onSubmitStep: (
    questionId: string,
    answers: Record<string, QuestionAnswerValue>,
  ) => Promise<void>;
  onCancel: (questionId: string) => Promise<void>;
  onGoBack: (questionId: string) => Promise<void>;
}

function validateField(
  field: QuestionField,
  value: QuestionAnswerValue | undefined,
): string | null {
  if (field.type === 'input') {
    const strValue = String(value ?? '').trim();
    if (field.required && strValue === '') return 'This field is required';
    if (
      field.inputType === 'email' &&
      strValue &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)
    )
      return 'Invalid email format';
    if (field.inputType === 'number' && strValue) {
      const num = Number(strValue);
      if (Number.isNaN(num)) return 'Must be a number';
      if (field.min !== undefined && num < field.min)
        return `Min value is ${field.min}`;
      if (field.max !== undefined && num > field.max)
        return `Max value is ${field.max}`;
    }
    if (field.minLength !== undefined && strValue.length < field.minLength)
      return `Min length is ${field.minLength}`;
    if (field.maxLength !== undefined && strValue.length > field.maxLength)
      return `Max length is ${field.maxLength}`;
  }

  if (field.type === 'radio-group') {
    if (field.required && (value === undefined || value === ''))
      return 'Please select an option';
    // Validate "Other" option: custom text must not be empty after trimming
    if (
      typeof value === 'string' &&
      value.startsWith('__other__:') &&
      value.slice('__other__:'.length).trim() === ''
    )
      return 'Please enter a value';
  }

  if (field.type === 'checkbox-group') {
    const arr = Array.isArray(value) ? value : [];
    if (field.required && arr.length === 0) return 'Select at least one option';
  }

  return null;
}

function getDefaultValues(
  fields: QuestionField[],
  existingAnswers?: Record<string, QuestionAnswerValue>,
): Record<string, QuestionAnswerValue> {
  const values: Record<string, QuestionAnswerValue> = {};
  for (const field of fields) {
    // Prefill from existing answers (e.g. when navigating back)
    if (existingAnswers && field.questionId in existingAnswers) {
      values[field.questionId] = existingAnswers[field.questionId]!;
      continue;
    }
    switch (field.type) {
      case 'input':
        values[field.questionId] = field.defaultValue ?? '';
        break;
      case 'radio-group':
        values[field.questionId] = field.defaultValue ?? '';
        break;
      case 'checkbox':
        values[field.questionId] = field.defaultValue ?? false;
        break;
      case 'checkbox-group':
        values[field.questionId] = field.defaultValues ?? [];
        break;
    }
  }
  return values;
}

/** Selector for the "Other" text input inside a radio group container. */
const OTHER_INPUT_SEL =
  'input:not([type="hidden"]):not([type="radio"])' as const;

/** Find the best element to focus inside a question container. */
function findFocusTarget(container: Element): HTMLElement | null {
  // Prefer the active radio button in a radio group
  const checked = container.querySelector<HTMLElement>('[data-checked]');
  if (checked) {
    // If "Other" is selected, focus the text input instead of the radio
    const siblingInput = checked
      .closest('label')
      ?.querySelector<HTMLElement>('input');
    if (siblingInput) return siblingInput;
    return checked;
  }
  // Fall back to first focusable element
  return container.querySelector<HTMLElement>(
    'input:not([tabindex="-1"]), button, [role="radio"], [role="checkbox"]',
  );
}

function UserQuestionForm({
  pendingQuestion,
  onSubmitStep,
  onGoBack,
}: {
  pendingQuestion: PendingUserQuestion;
  onSubmitStep: (
    questionId: string,
    answers: Record<string, QuestionAnswerValue>,
  ) => Promise<void>;
  onGoBack: (questionId: string) => Promise<void>;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const currentStepData = pendingQuestion.steps[pendingQuestion.currentStep];
  const isLastStep =
    pendingQuestion.currentStep === pendingQuestion.steps.length - 1;
  const isFirstStep = pendingQuestion.currentStep === 0;

  const [formValues, setFormValues] = useState<
    Record<string, QuestionAnswerValue>
  >(() =>
    getDefaultValues(currentStepData?.fields ?? [], pendingQuestion.answers),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form values when step changes
  const stepKey = pendingQuestion.currentStep;
  const [prevStep, setPrevStep] = useState(stepKey);
  if (stepKey !== prevStep) {
    setPrevStep(stepKey);
    setFormValues(
      getDefaultValues(currentStepData?.fields ?? [], pendingQuestion.answers),
    );
    setErrors({});
  }

  // Keep module-level draft answers in sync for the interrupt flow
  useEffect(() => {
    _draftAnswers = formValues;
    return () => {
      _draftAnswers = {};
    };
  }, [formValues]);

  // Auto-focus first focusable field after mount / step change
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const first = formRef.current?.querySelector('[data-question]');
      if (first) findFocusTarget(first)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [stepKey]);

  const updateValue = useCallback(
    (questionId: string, value: QuestionAnswerValue) => {
      setFormValues((prev) => ({ ...prev, [questionId]: value }));
      setErrors((prev) => {
        if (!prev[questionId]) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!currentStepData || isSubmitting) return;

    // Validate all fields
    const newErrors: Record<string, string> = {};
    for (const field of currentStepData.fields) {
      const error = validateField(field, formValues[field.questionId]);
      if (error) newErrors[field.questionId] = error;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitStep(pendingQuestion.id, formValues);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    currentStepData,
    formValues,
    isSubmitting,
    onSubmitStep,
    pendingQuestion.id,
  ]);

  // Check if all fields on the current step pass validation (for button enabled state)
  const isStepComplete = useMemo(() => {
    if (!currentStepData) return false;
    return currentStepData.fields.every(
      (field) => validateField(field, formValues[field.questionId]) === null,
    );
  }, [currentStepData, formValues]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && isStepComplete && !isSubmitting) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [isStepComplete, isSubmitting, handleSubmit],
  );

  const handleFieldBlur = useCallback(
    (questionId: string, error: string | null) => {
      setErrors((prev) => {
        if (error) return { ...prev, [questionId]: error };
        if (!prev[questionId]) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    },
    [],
  );

  /** Redirect focus to the chat input when Tab moves past the form. */
  const focusChatInput = useCallback(() => {
    formRef.current
      ?.closest('#chat-input-container-box')
      ?.querySelector<HTMLElement>('[contenteditable]')
      ?.focus();
  }, []);

  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const viewportRef = useMemo(
    () => ({ current: viewport }),
    [viewport],
  ) as React.RefObject<HTMLElement>;

  const { maskStyle } = useScrollFadeMask(viewportRef, {
    axis: 'vertical',
    fadeDistances: { top: 12, bottom: 20 },
  });

  if (!currentStepData) return null;

  return (
    <div
      ref={formRef}
      className="flex max-h-[max(24px,30vh)] min-h-6 flex-col pt-1.5"
      onKeyDown={handleKeyDown}
    >
      <OverlayScrollbar
        className="mask-alpha min-h-0 flex-1"
        contentClassName="flex flex-col gap-4 p-2 pt-1 pb-5"
        style={maskStyle}
        options={{ overflow: { x: 'hidden', y: 'scroll' } }}
        onViewportRef={setViewport}
      >
        {currentStepData.description && (
          <span className="shrink-0 text-muted-foreground text-xs [&_p]:m-0 [&_p]:inline">
            <Streamdown isAnimating={false}>
              {currentStepData.description}
            </Streamdown>
          </span>
        )}

        {currentStepData.fields.map((field, i) => (
          <React.Fragment key={field.questionId}>
            {i > 0 && <hr className="shrink-0 border-border/50 border-t" />}
            <FieldRenderer
              field={field}
              value={formValues[field.questionId]}
              error={errors[field.questionId]}
              onChange={(val) => updateValue(field.questionId, val)}
              onBlur={handleFieldBlur}
            />
          </React.Fragment>
        ))}
      </OverlayScrollbar>

      <div className="flex shrink-0 flex-row items-center justify-end gap-1.5 px-2 pt-1 pb-2">
        {!isFirstStep && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void onGoBack(pendingQuestion.id)}
          >
            Back
          </Button>
        )}
        <Button
          variant="primary"
          size="xs"
          onClick={() => void handleSubmit()}
          disabled={!isStepComplete || isSubmitting}
        >
          {isLastStep ? 'Send' : 'Next'}
          <CornerDownLeftIcon className="ml-1 size-3" />
        </Button>
      </div>
      {/* Focus sentinel: catches Tab past the last element and redirects to chat input */}
      <div // biome-ignore lint/a11y/noNoninteractiveTabindex: focus sentinel
        tabIndex={0}
        aria-hidden
        className="absolute size-0 overflow-hidden"
        onFocus={focusChatInput}
      />
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  error,
  onChange,
  onBlur,
}: {
  field: QuestionField;
  value: QuestionAnswerValue | undefined;
  error?: string;
  onChange: (value: QuestionAnswerValue) => void;
  onBlur?: (questionId: string, error: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Refs for radio-group "Other" state — declared unconditionally to
  // satisfy the Rules of Hooks. Only used when field.type === 'radio-group'.
  const otherTextRef = useRef('');
  const skipOtherRedirectRef = useRef(false);
  // Track pending RAF handles so they can be cancelled on unmount
  const pendingRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pendingRafRef.current !== null)
        cancelAnimationFrame(pendingRafRef.current);
    };
  }, []);

  /** Scroll the full question into view when focus enters from outside. */
  const handleQuestionFocus = useCallback((e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      e.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, []);

  /** Validate the field when focus leaves the question entirely. */
  const handleQuestionBlur = useCallback(
    (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        onBlur?.(field.questionId, validateField(field, value));
      }
    },
    [field, value, onBlur],
  );

  /** Schedule a RAF and track the handle for cleanup. */
  const scheduleRaf = useCallback((fn: () => void) => {
    if (pendingRafRef.current !== null)
      cancelAnimationFrame(pendingRafRef.current);
    pendingRafRef.current = requestAnimationFrame(() => {
      pendingRafRef.current = null;
      fn();
    });
  }, []);

  switch (field.type) {
    case 'input':
      return (
        <div
          data-question
          className="flex shrink-0 flex-col gap-1.5"
          onFocus={handleQuestionFocus}
          onBlur={handleQuestionBlur}
        >
          <span className="font-medium text-foreground text-xs">
            <InlineMarkdown>{field.label}</InlineMarkdown>
            {field.required && <span className="text-error-solid"> *</span>}
          </span>
          {field.description && (
            <span className="text-2xs text-muted-foreground">
              <InlineMarkdown>{field.description}</InlineMarkdown>
            </span>
          )}
          <Input
            size="xs"
            type={field.inputType ?? 'text'}
            placeholder={field.placeholder}
            value={String(value ?? '')}
            onValueChange={(val) =>
              onChange(
                field.inputType === 'number'
                  ? val === ''
                    ? ''
                    : Number(val)
                  : val,
              )
            }
          />
          {error && (
            <span className="text-2xs text-warning-foreground">{error}</span>
          )}
        </div>
      );

    case 'radio-group': {
      const strValue = String(value ?? '');
      const isOtherSelected = strValue.startsWith('__other__:');
      const otherText = isOtherSelected
        ? strValue.slice('__other__:'.length)
        : '';
      // Keep a stable copy of the other text so it survives switching away
      if (isOtherSelected) otherTextRef.current = otherText;
      // For RadioGroup value: use '__other__' sentinel when Other is selected
      const radioValue = isOtherSelected ? '__other__' : strValue;
      const showOther = field.allowOther !== false;

      /** Focus the "Other" text input on the next frame. */
      const focusOtherInput = () => {
        scheduleRaf(() => {
          containerRef.current
            ?.querySelector<HTMLInputElement>(OTHER_INPUT_SEL)
            ?.focus();
        });
      };

      return (
        <div
          ref={containerRef}
          data-question
          className="flex shrink-0 flex-col gap-2"
          onFocus={handleQuestionFocus}
          onBlur={handleQuestionBlur}
          onKeyDown={(e) => {
            if (dispatchArrowFromCtrl(e)) return;
            // Auto-switch to "Other" when typing a printable char on a radio
            if (
              showOther &&
              e.key.length === 1 &&
              e.key !== ' ' &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey &&
              (e.target as HTMLElement).tagName !== 'INPUT'
            ) {
              e.preventDefault();
              onChange(
                isOtherSelected
                  ? `__other__:${otherText}${e.key}`
                  : `__other__:${e.key}`,
              );
              focusOtherInput();
            }
          }}
        >
          <span className="font-medium text-foreground text-xs">
            <InlineMarkdown>{field.label}</InlineMarkdown>
            {field.required && <span className="text-error-solid"> *</span>}
          </span>
          {field.description && (
            <span className="text-2xs text-muted-foreground">
              <InlineMarkdown>{field.description}</InlineMarkdown>
            </span>
          )}
          <RadioGroup
            value={radioValue}
            onValueChange={(val) => {
              if (val === '__other__') {
                onChange(`__other__:${otherTextRef.current}`);
                focusOtherInput();
              } else {
                onChange(val as string);
              }
            }}
          >
            {field.options.map((opt) => (
              <RadioLabel key={opt.value}>
                <Radio value={opt.value} className="size-3.5 p-1" />
                <span className="text-xs">
                  <InlineMarkdown>{opt.label}</InlineMarkdown>
                </span>
              </RadioLabel>
            ))}
            {showOther && (
              <RadioLabel>
                <Radio
                  value="__other__"
                  className="size-3.5 p-1"
                  onFocus={() => {
                    if (skipOtherRedirectRef.current) {
                      skipOtherRedirectRef.current = false;
                      return;
                    }
                    if (isOtherSelected) focusOtherInput();
                  }}
                />
                <Input
                  size="xs"
                  tabIndex={-1}
                  placeholder="Other (please enter)..."
                  value={isOtherSelected ? otherText : otherTextRef.current}
                  onValueChange={(val) => onChange(`__other__:${val}`)}
                  onFocus={() => {
                    if (!isOtherSelected)
                      onChange(`__other__:${otherTextRef.current}`);
                  }}
                  onKeyDown={(e) => {
                    if (dispatchArrowFromCtrl(e)) return;
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      // Select the adjacent option and focus its radio
                      e.preventDefault();
                      const opts = field.options;
                      if (opts.length === 0) return;
                      onChange(
                        e.key === 'ArrowUp'
                          ? opts[opts.length - 1]!.value
                          : opts[0]!.value,
                      );
                      scheduleRaf(() => {
                        containerRef.current
                          ?.querySelector<HTMLElement>('[data-checked]')
                          ?.focus();
                      });
                    } else if (e.key === 'Tab' && e.shiftKey) {
                      // Find previous [data-question] sibling (skip <hr>s)
                      let el =
                        containerRef.current?.previousElementSibling ?? null;
                      while (el && !el.hasAttribute('data-question')) {
                        el = el.previousElementSibling;
                      }
                      if (el) {
                        e.preventDefault();
                        findFocusTarget(el)?.focus();
                      } else {
                        // First question — let browser Shift+Tab out, but
                        // prevent the __other__ radio from trapping focus back
                        skipOtherRedirectRef.current = true;
                      }
                    }
                  }}
                  className="min-w-0 flex-1"
                />
              </RadioLabel>
            )}
          </RadioGroup>
          {error && (
            <span className="text-2xs text-warning-foreground">{error}</span>
          )}
        </div>
      );
    }

    case 'checkbox':
      return (
        <div
          data-question
          className="flex shrink-0 flex-col gap-1.5"
          onFocus={handleQuestionFocus}
          onBlur={handleQuestionBlur}
        >
          {/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox is a custom input component */}
          <label className="flex flex-row items-center gap-2">
            <Checkbox
              size="xs"
              checked={value === true}
              className="shrink-0"
              onCheckedChange={(checked) => onChange(checked)}
            />
            <span className="text-foreground text-xs">
              <InlineMarkdown>{field.label}</InlineMarkdown>
            </span>
          </label>
          {field.description && (
            <span className="pl-5.5 text-2xs text-muted-foreground">
              <InlineMarkdown>{field.description}</InlineMarkdown>
            </span>
          )}
        </div>
      );

    case 'checkbox-group': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div
          data-question
          className="flex shrink-0 flex-col gap-1.5"
          onFocus={handleQuestionFocus}
          onBlur={handleQuestionBlur}
        >
          <span className="font-medium text-foreground text-xs">
            <InlineMarkdown>{field.label}</InlineMarkdown>
            {field.required && <span className="text-error-solid"> *</span>}
          </span>
          {field.description && (
            <span className="text-2xs text-muted-foreground">
              <InlineMarkdown>{field.description}</InlineMarkdown>
            </span>
          )}
          <div className="flex flex-col gap-1.5">
            {field.options.map((opt) => (
              // biome-ignore lint/a11y/noLabelWithoutControl: Checkbox is a custom input component
              <label
                key={opt.value}
                className="flex flex-row items-center gap-2"
              >
                <Checkbox
                  size="xs"
                  className="shrink-0"
                  checked={selected.includes(opt.value)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...selected, opt.value]);
                    } else {
                      onChange(selected.filter((v) => v !== opt.value));
                    }
                  }}
                />
                <span className="text-xs">
                  <InlineMarkdown>{opt.label}</InlineMarkdown>
                </span>
              </label>
            ))}
          </div>
          {error && (
            <span className="text-2xs text-warning-foreground">{error}</span>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

export function UserQuestionSection(
  props: UserQuestionSectionProps,
): StatusCardSection | null {
  if (!props.pendingQuestion) return null;

  const { pendingQuestion } = props;
  const isMultiStep = pendingQuestion.steps.length > 1;
  const stepIndicator = isMultiStep
    ? ` (${pendingQuestion.currentStep + 1}/${pendingQuestion.steps.length})`
    : '';

  return {
    key: 'user-question',
    defaultOpen: true,
    trigger: (isOpen: boolean) => (
      <div className="flex h-6 w-full flex-row items-center justify-between gap-2 pr-1 pl-1.5 text-muted-foreground text-xs hover:text-foreground has-[button:hover]:text-muted-foreground">
        <div className="flex flex-row items-center justify-start gap-2">
          <ChevronDownIcon
            className={cn(
              'size-3 shrink-0 transition-transform duration-50',
              isOpen && 'rotate-180',
            )}
          />
          <IconHelpChatOutline18 className="size-3 shrink-0" />
          <span className="truncate">
            {pendingQuestion.title}
            {stepIndicator}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-2xs"
          onClick={(e) => {
            e.stopPropagation();
            void props.onCancel(pendingQuestion.id);
          }}
        >
          <XIcon className="size-3" />
        </Button>
      </div>
    ),
    content: (
      <UserQuestionForm
        pendingQuestion={pendingQuestion}
        onSubmitStep={props.onSubmitStep}
        onGoBack={props.onGoBack}
      />
    ),
  };
}

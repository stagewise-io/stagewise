import type { CodingPlanId } from '@shared/coding-plans';
import type {
  ModelProvider,
  PersonalizationThemeId,
  ProviderInstanceTypeId,
} from './shared-types';

export type OnboardingStep =
  | 'configure-providers'
  | 'configure-skills'
  | 'personalization';
export type OnboardingNavigationAction = 'next' | 'back' | 'skip' | 'finish';
export type OnboardingProviderKind =
  | 'vendor-api'
  | 'coding-plan'
  | 'gateway'
  | 'self-hosted';
export type OnboardingProviderIdentity = {
  provider_key: string;
  provider_type: ProviderInstanceTypeId;
  provider_kind: OnboardingProviderKind;
  plan_id?: CodingPlanId;
};
export type OnboardingAuthMethod = 'api-keys' | 'coding-plan';
export type OnboardingAuthFailureKind =
  | 'validation-error'
  | 'backend-error'
  | 'network-error'
  | 'unknown-error';

export type UIEventProperties = {
  'chat-new-agent-clicked': {
    source:
      | 'sidebar-top'
      | 'sidebar-active-agents'
      | 'sidebar-workspace-group'
      | 'collapsed-titlebar'
      | 'hotkey';
  };
  'chat-sidebar-toggled': { new_value: 'open' | 'closed' };
  'closed-lid-sleep-toggled': { enabled: boolean };
  'custom-model-add-aborted': {
    had_validation_errors: boolean;
    any_field_touched: boolean;
    provider_type: ProviderInstanceTypeId | 'unknown';
  };
  'custom-model-add-finished': {
    model_id?: string;
    provider_type: ProviderInstanceTypeId | 'unknown';
  };
  'custom-model-add-started': {
    initial_provider_type: ProviderInstanceTypeId | 'unknown';
  };
  'custom-provider-add-aborted':
    | {
        had_validation_errors: boolean;
        any_field_touched: boolean;
        api_spec: string;
        is_local?: boolean;
        base_url?: string;
        aws_auth_mode?: 'access-keys' | 'profile' | 'default-chain';
      }
    | undefined;
  'custom-provider-add-finished': {
    api_spec: string;
    is_local?: boolean;
    base_url?: string;
    aws_auth_mode?: 'access-keys' | 'profile' | 'default-chain';
  };
  'custom-provider-add-started': undefined;
  'element-selection-started': undefined;
  'element-selection-stopped': { element_selected: boolean };
  'onboarding-started': {
    onboarding_run_id: string;
    connected_provider_count: number;
  };
  'onboarding-step-viewed': {
    onboarding_run_id: string;
    step: OnboardingStep;
    previous_step?: OnboardingStep;
    visit_index: number;
    elapsed_ms_since_start: number;
  };
  'onboarding-step-exited': {
    onboarding_run_id: string;
    step: OnboardingStep;
    destination: OnboardingStep | 'completed';
    action: OnboardingNavigationAction;
    duration_ms: number;
  };
  'onboarding-auth-skipped': { onboarding_run_id: string };
  'onboarding-provider-detail-viewed': OnboardingProviderIdentity & {
    onboarding_run_id: string;
    position: number;
    search_active: boolean;
    already_connected: boolean;
  };
  'onboarding-provider-connect-attempted': OnboardingProviderIdentity & {
    onboarding_run_id: string;
    attempt_number: number;
  };
  'onboarding-provider-connected': OnboardingProviderIdentity & {
    onboarding_run_id: string;
    attempt_number: number;
    duration_ms: number;
    discovered_model_count: number;
  };
  'onboarding-provider-connect-failed': OnboardingProviderIdentity & {
    onboarding_run_id: string;
    attempt_number: number;
    duration_ms: number;
    failure_stage: 'credential-validation' | 'rpc';
    error_kind: 'validation-error' | 'network-error' | 'unknown-error';
  };
  'onboarding-provider-step-completed': {
    onboarding_run_id: string;
    duration_ms: number;
    connected_provider_count: number;
    connected_during_step_count: number;
    connected_provider_keys: string[];
    viewed_provider_count: number;
    connection_attempt_count: number;
    connection_failure_count: number;
    search_used: boolean;
    skipped_without_provider: boolean;
  };
  'onboarding-auth-api-key-input-focused': { provider: ModelProvider };
  'onboarding-auth-coding-plan-opened': {
    plan_id: CodingPlanId;
    provider: ModelProvider;
  };
  'onboarding-auth-method-completed': {
    auth_method: OnboardingAuthMethod;
    provider?: ModelProvider;
    plan_id?: CodingPlanId;
  };
  'onboarding-auth-method-failed': {
    auth_method: OnboardingAuthMethod;
    provider?: ModelProvider;
    plan_id?: CodingPlanId;
    error_kind: OnboardingAuthFailureKind;
  };
  'onboarding-auth-mode-switched': {
    from: OnboardingAuthMethod;
    to: OnboardingAuthMethod;
  };
  'onboarding-auth-provider-disconnected': {
    auth_method: 'api-keys' | 'coding-plan';
    provider: ModelProvider;
    plan_id?: CodingPlanId;
  };
  'onboarding-auth-providers-expanded': { expanded: boolean };
  'onboarding-demo-slide-clicked': { slide_name: string };
  'settings-opened': undefined;
  'suggestion-clicked': {
    suggestion_id: string;
    context: 'onboarding' | 'empty-chat';
  };
  'suggestion-dismissed': {
    suggestion_id: string;
    context: 'onboarding' | 'empty-chat';
  };
  'tabs-cleaned': { closed_count: number };
  'workspace-connect-aborted': {
    reason: 'picker-closed' | 'suggestions-dismissed';
  };
  'workspace-connect-failed': { source: 'picker' | 'recent-workspace' };
  'workspace-connect-finished': undefined;
  'workspace-connect-started': undefined;
  'changed-theme': { theme: PersonalizationThemeId };
  'changed-notification-sound-loudness': {
    loudness: 'default' | 'off' | 'subtle';
  };
  'changed-notification-sound-theme': { theme: string };
  'experience-survey-answered': { answer: 'yes' | 'no' };
  'experience-survey-feedback-submitted': {
    feedback: string;
    feedback_length: number;
  };
  'experience-founder-call-survey-opened': undefined;
  'experience-founder-call-survey-dismissed': undefined;
};

export type UIEventName = keyof UIEventProperties;
export type TrackUIEvent = <T extends string>(
  eventName: T,
  ...args: T extends UIEventName
    ? undefined extends UIEventProperties[T]
      ? [properties?: UIEventProperties[T]]
      : [properties: UIEventProperties[T]]
    : [properties?: Record<string, unknown>]
) => Promise<void>;

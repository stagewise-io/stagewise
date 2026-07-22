import type { CodingPlanId } from '@shared/coding-plans';
import type {
  ModelProvider,
  PersonalizationThemeId,
  ProviderInstanceTypeId,
  SocialAuthProvider,
} from './shared-types';

export type OnboardingStep =
  | 'login'
  | 'configure-providers'
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
export type OnboardingAuthMethod = 'stagewise' | 'api-keys' | 'coding-plan';
export type OnboardingAuthFailureKind =
  | 'validation-error'
  | 'backend-error'
  | 'network-error'
  | 'unknown-error';
export type OnboardingOtpFailureKind =
  | 'backend-error'
  | 'network-error'
  | 'turnstile-not-ready'
  | 'turnstile-solve-failed';
export type AuthHandoffProvider = SocialAuthProvider | 'email';

export type UIEventProperties = {
  'account-page-viewed': undefined;
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
  };
  'custom-model-add-finished': undefined;
  'custom-model-add-started': undefined;
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
    already_authenticated: boolean;
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
    provider?: ModelProvider | AuthHandoffProvider;
    plan_id?: CodingPlanId;
    error_kind: OnboardingAuthFailureKind;
  };
  'onboarding-auth-mode-switched': {
    from: OnboardingAuthMethod;
    to: OnboardingAuthMethod;
  };
  'onboarding-auth-social-requested': { provider: SocialAuthProvider };
  'onboarding-auth-social-verified': { provider: SocialAuthProvider };
  'onboarding-auth-email-handoff-requested': undefined;
  'onboarding-auth-email-handoff-verified': undefined;
  'onboarding-auth-otp-failed': { error_kind: OnboardingOtpFailureKind };
  'onboarding-auth-otp-requested': undefined;
  'onboarding-auth-otp-verified': undefined;
  'onboarding-auth-provider-disconnected': {
    auth_method: 'api-keys' | 'coding-plan';
    provider: ModelProvider;
    plan_id?: CodingPlanId;
  };
  'onboarding-auth-providers-expanded': { expanded: boolean };
  'account-auth-social-requested': { provider: SocialAuthProvider };
  'account-auth-social-verified': { provider: SocialAuthProvider };
  'account-auth-email-handoff-requested': undefined;
  'account-auth-email-handoff-verified': undefined;
  'account-auth-otp-failed': { error_kind: OnboardingOtpFailureKind };
  'account-auth-otp-requested': undefined;
  'account-auth-otp-verified': undefined;
  'account-auth-method-failed': {
    auth_method: 'stagewise';
    provider?: AuthHandoffProvider;
    error_kind: OnboardingAuthFailureKind;
  };
  'chat-auth-social-requested': { provider: SocialAuthProvider };
  'chat-auth-social-verified': { provider: SocialAuthProvider };
  'chat-auth-email-handoff-requested': undefined;
  'chat-auth-email-handoff-verified': undefined;
  'chat-auth-otp-failed': { error_kind: OnboardingOtpFailureKind };
  'chat-auth-otp-requested': undefined;
  'chat-auth-otp-verified': undefined;
  'chat-auth-method-failed': {
    auth_method: 'stagewise';
    provider?: AuthHandoffProvider;
    error_kind: OnboardingAuthFailureKind;
  };
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

# Telemetry Data Collection

The stagewise code editor extension collects pseudonymized usage data to help improve our products and services. We take your privacy seriously and are committed to transparency about our data collection practices.

## What We Collect

We collect the following types of telemetry data:

### System Metadata
- Extension activation events (`extension_activated`)
  - IDE information (VS Code version)
- Loading of workspace with web apps (`opened_web_app_workspace`)
  - When a workspace with some popular web framework is loaded
- Toolbar connection events (`toolbar_connected`)
- Agent usage (`agent_prompt_triggered`)
  - When the AI agent is invoked
- Toolbar setup events (`toolbar_auto_setup_started`)
  - When the automatic toolbar setup process is initiated
- Getting started panel events (`getting_started_panel_shown`, `getting_started_panel_manual_show`, `interacted_with_getting_started_panel`, `dismissed_getting_started_panel`, `clicked_setup_toolbar_in_getting_started_panel`, `clicked_open_docs_in_getting_started_panel`)
  - When the getting started panel is shown automatically to new users or manually opened
- User feedback (`post_setup_feedback`)
  - Feedback provided by users after toolbar setup (includes feedback type, text, and optional email for follow-up)
- Toolbar update recommendation events (`show_toolbar_update_notification`, `toolbar_update_notification_auto_update`, `toolbar_update_notification_ignored`, `toolbar_update_notification_dismissed`)
  - When users get recommended updating the stagewise toolbar on loading of workspaces
- Toolbar integration recommendation events (`show_toolbar_integration_notification`, `toolbar_integration_notification_ignore`, `toolbar_integration_notification_dismissed`)
  - When users get recommended integrating the toolbar into their project
- Toolbar dependency auto-updating triggered (`toolbar_auto_update_prompt_sent`)
  - When users trigger an auto-update sequence for the toolbar packages
- Telemetry setting changes (`telemetry_disabled`, `telemetry_enabled`)
  - When users opt-out or opt-in to telemetry collection
- Authentication events (`authenticate_command_triggered`, `logout_command_triggered`, `check_auth_status_command_triggered`)
  - When users trigger authentication-related commands

### Event Details

#### Extension Lifecycle Events
- `extension_activated`: Triggered when the extension starts up
  - Includes: IDE type
- `toolbar_connected`: Triggered when the toolbar in web app dev mode connects to the extension


#### Feature Usage Events
- `agent_prompt_triggered`: Triggered when the AI agent is invoked
  - No additional properties collected
- `toolbar_auto_setup_started`: Triggered when the automatic toolbar setup process is initiated
  - No additional properties collected
- `toolbar_setup_completed`: Triggered when the toolbar setup is completed successfully
  - No additional properties collected
- `getting_started_panel_shown`: Triggered when the getting started panel is automatically shown to first-time users
  - No additional properties collected
- `getting_started_panel_manual_show`: Triggered when a user manually opens the getting started panel via command
  - No additional properties collected
- `post_setup_feedback`: Triggered when a user provides feedback after toolbar setup
  - Includes: feedback type, feedback text, and optional email address for follow-up
- `show_toolbar_update_notification`: Triggered when a auto-update reocmmendation for the toolbar pops up
  - No additional properties collected
- `toolbar_update_notification_auto_update`: Triggered when the user decides to proceed with the auto-update
  - No additional properties collected
- `toolbar_update_notification_ignored`: Triggered when the user decides to explicitly ignore auto-update
  - No additional properties collected
- `toolbar_update_notification_dismissed`: Triggered when the user dismisses the toolbar update notification
  - No additional properties collected
- `toolbar_auto_update_prompt_sent`: Triggered then the prompt for updating the toolbar was actually sent
  - No additional properties collected
- `show_toolbar_integration_notification`: Triggered when the user is shown a recommendation to integrate stagewise into their app
  - No additional properties collected
- `toolbar_integration_notification_ignore`: Triggered when the user decides to explicitly ignore the integration recommendation
  - No additional properties collected
- `toolbar_integration_notification_dismissed`: Triggered when the user dismisses the toolbar integration notification
  - No additional properties collected

#### Authentication Events
- `authenticate_command_triggered`: Triggered when a user initiates the authentication process
  - No additional properties collected
- `logout_command_triggered`: Triggered when a user logs out of their account
  - No additional properties collected
- `check_auth_status_command_triggered`: Triggered when a user checks their authentication status
  - No additional properties collected

#### Privacy Events
- `telemetry_disabled`: Triggered when a user disables telemetry collection
  - Tracked once when the setting changes, before telemetry is actually disabled
  - Helps us understand opt-out rates and improve our privacy practices
- `telemetry_enabled`: Triggered when a user re-enables telemetry collection
  - Tracked when users opt back in after previously disabling telemetry

#### Error Events
- `activation_error`: Triggered when the extension fails to activate
  - Includes: Error message (scrubbed of PII)
- `toolbar_setup_failed`: Triggered when the toolbar setup process fails
  - Includes: Error message (scrubbed of PII)

### Data Collection Method

We use pseudonymization to protect user privacy while maintaining data quality:
- Each user is assigned a consistent but non-identifying hash
- This allows us to understand usage patterns without identifying individuals
- The hash is generated from system information and cannot be reversed
- No direct connection between the hash and user identity is maintained

## What We Don't Collect

We do NOT collect:
- Personal identifiable information (PII) except for optionally provided email addresses during feedback
- File contents or file names
- User names
- Project-specific information
- Workspace paths or repository names
- Any sensitive data

## How to View Telemetry Events

You can view all telemetry events that this extension may send by:

1. Running the VS Code CLI command:
   ```bash
   code --telemetry
   ```
2. Examining our [telemetry.json](./telemetry.json) file
3. Using the VS Code command "Developer: Show Telemetry" to see live events

## How to Opt Out

You can disable telemetry collection in two ways:

### 1. VS Code Global Setting
To disable telemetry for all extensions:
1. Open VS Code Settings (Ctrl+,/Cmd+,)
2. Search for "telemetry"
3. Set `telemetry.telemetryLevel` to "off"

### 2. Extension-Specific Setting
To disable telemetry just for Stagewise:
1. Open VS Code Settings (Ctrl+,/Cmd+,)
2. Search for "stagewise telemetry"
3. Uncheck "Stagewise: Telemetry Enabled"

## Data Usage

The collected pseudonymized data helps us:
- Understand how features are used
- Identify and fix bugs
- Improve extension performance
- Guide development priorities
- Enhance user experience

## GDPR Compliance

We are committed to GDPR compliance:
- All data collection is opt-out
- Data is pseudonymized, not anonymized
- No personal data is collected
- Clear documentation of all collected data
- Easy opt-out mechanisms
- Transparent data handling practices
- Right to be forgotten (data deletion upon request)

## Data Retention

- Pseudonymized telemetry data is retained for a maximum of 90 days
- Error reports are retained for 30 days
- All data is automatically deleted after retention period
- Data is stored securely in compliance with industry standards

## More Information

- [VS Code Telemetry Documentation](https://code.visualstudio.com/docs/getstarted/telemetry)
- [Microsoft Privacy Statement](https://privacy.microsoft.com/privacystatement)
- [Stagewise Privacy Policy](https://stagewise.io/privacy)

## Questions or Concerns?

If you have questions about our telemetry practices, please:
1. File an issue on our [GitHub repository](https://github.com/stagewise-io/stagewise/issues)
2. Contact us through our [website](https://stagewise.io/contact)
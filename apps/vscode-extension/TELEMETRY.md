# Telemetry Data Collection

The Stagewise VS Code extension collects pseudonymized usage data to help improve our products and services. We take your privacy seriously and are committed to transparency about our data collection practices.

## What We Collect

We collect the following types of telemetry data:

### System Metadata
- Extension activation events (`extension_activated`)
  - IDE information (VS Code version)
- Server information (`server_started`)
  - Port numbers for diagnostic purposes
- Agent usage (`agent_prompt_triggered`)
  - When the AI agent is invoked

### Error Data
- Extension activation errors (`activation_error`)
  - Error messages (scrubbed of personal information)
- Server startup failures (included in `activation_error`)

### Event Details

#### Extension Lifecycle Events
- `extension_activated`: Triggered when the extension starts up
  - Includes: IDE type
- `server_started`: Triggered when the local server successfully starts
  - Includes: Port number used

#### Feature Usage Events
- `agent_prompt_triggered`: Triggered when the AI agent is invoked
  - No additional properties collected

#### Error Events
- `activation_error`: Triggered when the extension fails to activate
  - Includes: Error message (scrubbed of PII)

### Data Collection Method

We use pseudonymization to protect user privacy while maintaining data quality:
- Each user is assigned a consistent but non-identifying hash
- This allows us to understand usage patterns without identifying individuals
- The hash is generated from system information and cannot be reversed
- No direct connection between the hash and user identity is maintained

## What We Don't Collect

We do NOT collect:
- Personal identifiable information (PII)
- File contents or file names
- User names or email addresses
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
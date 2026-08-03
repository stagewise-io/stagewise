import type { Meta, StoryObj } from '@storybook/react';
import { Streamdown } from './index';
import { withMockKarton } from '@sb/decorators/with-mock-karton';

const meta: Meta<typeof Streamdown> = {
  title: 'Components/Streamdown/LinkAliases',
  component: Streamdown,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-background p-4">
        <Story />
      </div>
    ),
    withMockKarton,
  ],
};

export default meta;
type Story = StoryObj<typeof Streamdown>;

/**
 * All Link Aliases
 *
 * Shows all 5 supported link aliases rendered together.
 * Hover over links to see the resolved URLs in tooltips.
 * Variables are substituted: agentInstanceId from the mock agent context,
 * appVersion from the build constant (__APP_VERSION__ = '0.0.0-storybook').
 */
export const AllAliases: Story = {
  args: {
    children: [
      'Here are all the link aliases:',
      '',
      '- [Report an agent issue](report-agent-issue)',
      '- [Request a new feature](request-new-feature)',
      '- [Join our Discord](socials-discord)',
      '- [Follow us on X](socials-x)',
      '- [Connect on LinkedIn](socials-linkedin)',
    ].join('\n'),
  },
};

/**
 * Agent Issue Link
 *
 * Shows the report-agent-issue alias with variable substitution.
 * The resolved URL includes the agent instance ID as a query parameter.
 */
export const AgentIssueLink: Story = {
  args: {
    children:
      "If something isn't working right, you can [report the issue here](report-agent-issue).",
  },
};

/**
 * Feature Request Link
 *
 * Shows the request-new-feature alias with variable substitution.
 * The resolved URL includes the app version as a query parameter.
 */
export const FeatureRequestLink: Story = {
  args: {
    children:
      "I can't do that yet, but you can [request this feature](request-new-feature) and the team will consider it!",
  },
};

/**
 * Social Links
 *
 * Shows the three social media link aliases.
 * These resolve to static URLs without variable substitution.
 */
export const SocialLinks: Story = {
  args: {
    children: [
      'Connect with us:',
      '',
      '- [Discord](socials-discord) - Join the community',
      '- [X (Twitter)](socials-x) - Follow for updates',
      '- [LinkedIn](socials-linkedin) - Professional network',
    ].join('\n'),
  },
};

/**
 * Mixed Content
 *
 * Demonstrates link aliases alongside regular external links
 * and other markdown content to verify they coexist correctly.
 */
export const MixedContent: Story = {
  args: {
    children: [
      '## Help & Resources',
      '',
      'If you need help, check out [the documentation](https://stagewise.io/docs).',
      '',
      "Didn't find what you need?",
      '- [Request a feature](request-new-feature)',
      '- [Report an agent issue](report-agent-issue)',
      '',
      'Join the community on [Discord](socials-discord)!',
    ].join('\n'),
  },
};

import type { Meta, StoryObj } from '@storybook/react-vite';

const ColorSwatch = ({
  bgClass,
  textClass,
  mutedTextClass,
  label,
}: {
  bgClass: string;
  textClass: string;
  mutedTextClass: string;
  label: string;
}) => {
  return (
    <div className={`${bgClass} rounded-lg border border-border p-6`}>
      <div className="space-y-2">
        <div className={`${textClass} font-semibold text-sm`}>{label}</div>
        <div className={`${textClass} text-base`}>Regular text</div>
        <div className={`${mutedTextClass} text-sm`}>Muted text</div>
      </div>
    </div>
  );
};

const ColorShowcase = () => {
  return (
    <div className="space-y-8 p-8">
      <div>
        <h2 className="mb-4 font-bold text-2xl text-foreground">
          Color Combinations
        </h2>
        <p className="mb-6 text-muted-foreground">
          Showcasing the different background and text color combinations from
          our design system.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ColorSwatch
          bgClass="bg-background"
          textClass="text-foreground"
          mutedTextClass="text-muted-foreground"
          label="Background"
        />

        <ColorSwatch
          bgClass="bg-muted"
          textClass="text-foreground"
          mutedTextClass="text-muted-foreground"
          label="Muted"
        />

        <ColorSwatch
          bgClass="bg-primary"
          textClass="text-primary-foreground"
          mutedTextClass="text-primary-foreground/70"
          label="Primary"
        />

        <ColorSwatch
          bgClass="bg-foreground"
          textClass="text-background"
          mutedTextClass="text-background/70"
          label="Foreground (Inverted)"
        />

        <ColorSwatch
          bgClass="bg-zinc-950 dark:bg-zinc-50"
          textClass="text-zinc-50 dark:text-zinc-950"
          mutedTextClass="text-zinc-400 dark:text-zinc-600"
          label="High Contrast"
        />

        <ColorSwatch
          bgClass="bg-success/10"
          textClass="text-success"
          mutedTextClass="text-success/70"
          label="Success Tint"
        />

        <ColorSwatch
          bgClass="bg-error/10"
          textClass="text-error"
          mutedTextClass="text-error/70"
          label="Error Tint"
        />

        <ColorSwatch
          bgClass="bg-busy/10"
          textClass="text-busy"
          mutedTextClass="text-busy/70"
          label="Busy Tint"
        />
      </div>

      <div className="mt-12">
        <h3 className="mb-4 font-bold text-foreground text-xl">
          Semantic Colors
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-success p-6 text-white">
            <div className="font-semibold text-sm">Success</div>
            <div className="text-base">Operation completed</div>
            <div className="text-sm opacity-70">Secondary message</div>
          </div>

          <div className="rounded-lg bg-error p-6 text-white">
            <div className="font-semibold text-sm">Error</div>
            <div className="text-base">Something went wrong</div>
            <div className="text-sm opacity-70">Secondary message</div>
          </div>

          <div className="rounded-lg bg-busy p-6 text-white">
            <div className="font-semibold text-sm">Busy</div>
            <div className="text-base">Loading state</div>
            <div className="text-sm opacity-70">Secondary message</div>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <h3 className="mb-4 font-bold text-foreground text-xl">
          CSS Variable Reference
        </h3>
        <div className="space-y-2 rounded-lg bg-muted p-6 font-mono text-sm">
          <div className="text-foreground">
            <span className="text-muted-foreground">--color-background:</span>{' '}
            Background color
          </div>
          <div className="text-foreground">
            <span className="text-muted-foreground">--color-foreground:</span>{' '}
            Primary text color
          </div>
          <div className="text-foreground">
            <span className="text-muted-foreground">--color-muted:</span> Muted
            background
          </div>
          <div className="text-foreground">
            <span className="text-muted-foreground">
              --color-muted-foreground:
            </span>{' '}
            Muted text
          </div>
          <div className="text-foreground">
            <span className="text-muted-foreground">--color-primary:</span>{' '}
            Primary brand color
          </div>
          <div className="text-foreground">
            <span className="text-muted-foreground">
              --color-primary-foreground:
            </span>{' '}
            Text on primary
          </div>
          <div className="text-foreground">
            <span className="text-muted-foreground">--color-success:</span>{' '}
            Success state
          </div>
          <div className="text-foreground">
            <span className="text-muted-foreground">--color-error:</span> Error
            state
          </div>
          <div className="text-foreground">
            <span className="text-muted-foreground">--color-busy:</span>{' '}
            Busy/loading state
          </div>
        </div>
      </div>
    </div>
  );
};

const meta = {
  title: 'Example/Colors',
  component: ColorShowcase,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ColorShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ColorShowcase />,
};

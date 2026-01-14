import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  Select,
  type SelectItem,
  type SelectProps,
} from '../components/select';
import {
  CheckIcon,
  StarIcon,
  AlertCircleIcon,
  GlobeIcon,
  CodeIcon,
  DatabaseIcon,
  CloudIcon,
  UserIcon,
  MailIcon,
  PhoneIcon,
  MapPinIcon,
  CalendarIcon,
  ClockIcon,
  FileIcon,
  FolderIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  SettingsIcon,
  BellIcon,
  LockIcon,
  UnlockIcon,
  ShieldIcon,
  ZapIcon,
  HeartIcon,
  BookmarkIcon,
  TagIcon,
  LinkIcon,
  SearchIcon,
  FilterIcon,
  DownloadIcon,
  UploadIcon,
  RefreshCwIcon,
  TrashIcon,
  EditIcon,
  CopyIcon,
  PlusIcon,
  MinusIcon,
} from 'lucide-react';

const meta = {
  title: 'Example/Select',
  component: Select,
  parameters: {},
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md'],
    },
    triggerVariant: {
      control: 'select',
      options: ['ghost', 'secondary'],
    },
    side: {
      control: 'select',
      options: ['top', 'bottom', 'left', 'right'],
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end'],
    },
    showIcon: { control: 'boolean' },
    alignItemWithTrigger: { control: 'boolean' },
  },
  args: { onValueChange: fn() },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Basic Examples
// ============================================================================

export const Default: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
  },
};

export const WithPlaceholder: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    placeholder: 'Choose an option...',
  },
};

// ============================================================================
// Size Variants
// ============================================================================

export const ExtraSmall: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
    size: 'xs',
  },
};

export const Small: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
    size: 'md',
  },
};

// ============================================================================
// Trigger Variants
// ============================================================================

export const GhostTrigger: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
    triggerVariant: 'ghost',
  },
};

export const SecondaryTrigger: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
    triggerVariant: 'secondary',
  },
};

// ============================================================================
// With Icons
// ============================================================================

export const WithIcons: Story = {
  args: {
    items: [
      {
        value: 'completed',
        label: 'Completed',
        icon: <CheckIcon className="size-3" />,
      },
      {
        value: 'favorite',
        label: 'Favorite',
        icon: <StarIcon className="size-3" />,
      },
      {
        value: 'alert',
        label: 'Alert',
        icon: <AlertCircleIcon className="size-3" />,
      },
    ],
    defaultValue: 'completed',
  },
};

// ============================================================================
// With Descriptions (Two-Line Items)
// ============================================================================

export const WithDescriptions: Story = {
  args: {
    items: [
      {
        value: 'standard',
        label: 'Standard Shipping',
        description: 'Delivers in 4-6 business days - $4.99',
      },
      {
        value: 'express',
        label: 'Express Shipping',
        description: 'Delivers in 2-3 business days - $9.99',
      },
      {
        value: 'overnight',
        label: 'Overnight Shipping',
        description: 'Delivers next business day - $19.99',
      },
    ],
    defaultValue: 'standard',
    size: 'sm',
  },
};

// ============================================================================
// Object Items with Label and Sublabel (Two Lines)
// ============================================================================

export const ObjectItemsWithSublabels: Story = {
  args: {
    items: [
      {
        value: 'john',
        label: 'John Doe',
        description: 'john.doe@example.com - Engineering Lead',
        icon: <UserIcon className="size-3" />,
      },
      {
        value: 'jane',
        label: 'Jane Smith',
        description: 'jane.smith@example.com - Product Manager',
        icon: <UserIcon className="size-3" />,
      },
      {
        value: 'bob',
        label: 'Bob Johnson',
        description: 'bob.johnson@example.com - Designer',
        icon: <UserIcon className="size-3" />,
      },
      {
        value: 'alice',
        label: 'Alice Williams',
        description: 'alice.williams@example.com - Developer',
        icon: <UserIcon className="size-3" />,
      },
      {
        value: 'charlie',
        label: 'Charlie Brown',
        description: 'charlie.brown@example.com - QA Engineer',
        icon: <UserIcon className="size-3" />,
      },
    ],
    defaultValue: 'john',
    size: 'sm',
    placeholder: 'Select team member...',
  },
};

// ============================================================================
// Scrollable List (Many Items)
// ============================================================================

export const ScrollableList: Story = {
  args: {
    items: [
      { value: 'user', label: 'User', icon: <UserIcon className="size-3" /> },
      { value: 'mail', label: 'Mail', icon: <MailIcon className="size-3" /> },
      {
        value: 'phone',
        label: 'Phone',
        icon: <PhoneIcon className="size-3" />,
      },
      { value: 'map', label: 'Map', icon: <MapPinIcon className="size-3" /> },
      {
        value: 'calendar',
        label: 'Calendar',
        icon: <CalendarIcon className="size-3" />,
      },
      {
        value: 'clock',
        label: 'Clock',
        icon: <ClockIcon className="size-3" />,
      },
      { value: 'file', label: 'File', icon: <FileIcon className="size-3" /> },
      {
        value: 'folder',
        label: 'Folder',
        icon: <FolderIcon className="size-3" />,
      },
      {
        value: 'image',
        label: 'Image',
        icon: <ImageIcon className="size-3" />,
      },
      {
        value: 'video',
        label: 'Video',
        icon: <VideoIcon className="size-3" />,
      },
      {
        value: 'music',
        label: 'Music',
        icon: <MusicIcon className="size-3" />,
      },
      {
        value: 'settings',
        label: 'Settings',
        icon: <SettingsIcon className="size-3" />,
      },
      {
        value: 'bell',
        label: 'Notifications',
        icon: <BellIcon className="size-3" />,
      },
      { value: 'lock', label: 'Lock', icon: <LockIcon className="size-3" /> },
      {
        value: 'unlock',
        label: 'Unlock',
        icon: <UnlockIcon className="size-3" />,
      },
      {
        value: 'shield',
        label: 'Shield',
        icon: <ShieldIcon className="size-3" />,
      },
      {
        value: 'zap',
        label: 'Lightning',
        icon: <ZapIcon className="size-3" />,
      },
      {
        value: 'heart',
        label: 'Heart',
        icon: <HeartIcon className="size-3" />,
      },
      {
        value: 'bookmark',
        label: 'Bookmark',
        icon: <BookmarkIcon className="size-3" />,
      },
      { value: 'tag', label: 'Tag', icon: <TagIcon className="size-3" /> },
      { value: 'link', label: 'Link', icon: <LinkIcon className="size-3" /> },
      {
        value: 'search',
        label: 'Search',
        icon: <SearchIcon className="size-3" />,
      },
      {
        value: 'filter',
        label: 'Filter',
        icon: <FilterIcon className="size-3" />,
      },
      {
        value: 'download',
        label: 'Download',
        icon: <DownloadIcon className="size-3" />,
      },
      {
        value: 'upload',
        label: 'Upload',
        icon: <UploadIcon className="size-3" />,
      },
      {
        value: 'refresh',
        label: 'Refresh',
        icon: <RefreshCwIcon className="size-3" />,
      },
      {
        value: 'trash',
        label: 'Trash',
        icon: <TrashIcon className="size-3" />,
      },
      { value: 'edit', label: 'Edit', icon: <EditIcon className="size-3" /> },
      { value: 'copy', label: 'Copy', icon: <CopyIcon className="size-3" /> },
      { value: 'plus', label: 'Add', icon: <PlusIcon className="size-3" /> },
      {
        value: 'minus',
        label: 'Remove',
        icon: <MinusIcon className="size-3" />,
      },
    ],
    defaultValue: 'user',
    size: 'sm',
    placeholder: 'Select an action...',
  },
};

// ============================================================================
// Scrollable with Descriptions (Many Object Items)
// ============================================================================

export const ScrollableWithDescriptions: Story = {
  args: {
    items: [
      {
        value: 'user',
        label: 'User Management',
        description: 'Manage user accounts and permissions',
        icon: <UserIcon className="size-3" />,
      },
      {
        value: 'mail',
        label: 'Email Settings',
        description: 'Configure email notifications',
        icon: <MailIcon className="size-3" />,
      },
      {
        value: 'phone',
        label: 'Phone Integration',
        description: 'Connect phone services',
        icon: <PhoneIcon className="size-3" />,
      },
      {
        value: 'map',
        label: 'Location Services',
        description: 'Enable GPS and mapping',
        icon: <MapPinIcon className="size-3" />,
      },
      {
        value: 'calendar',
        label: 'Calendar Sync',
        description: 'Synchronize with external calendars',
        icon: <CalendarIcon className="size-3" />,
      },
      {
        value: 'clock',
        label: 'Time Tracking',
        description: 'Track hours and productivity',
        icon: <ClockIcon className="size-3" />,
      },
      {
        value: 'file',
        label: 'File Storage',
        description: 'Manage file uploads and storage',
        icon: <FileIcon className="size-3" />,
      },
      {
        value: 'folder',
        label: 'Folder Organization',
        description: 'Organize files into folders',
        icon: <FolderIcon className="size-3" />,
      },
      {
        value: 'image',
        label: 'Image Gallery',
        description: 'Manage and display images',
        icon: <ImageIcon className="size-3" />,
      },
      {
        value: 'video',
        label: 'Video Library',
        description: 'Store and stream videos',
        icon: <VideoIcon className="size-3" />,
      },
      {
        value: 'music',
        label: 'Audio Player',
        description: 'Play and manage audio files',
        icon: <MusicIcon className="size-3" />,
      },
      {
        value: 'settings',
        label: 'System Settings',
        description: 'Configure system preferences',
        icon: <SettingsIcon className="size-3" />,
      },
      {
        value: 'bell',
        label: 'Notification Center',
        description: 'Manage all notifications',
        icon: <BellIcon className="size-3" />,
      },
      {
        value: 'lock',
        label: 'Security Settings',
        description: 'Configure security options',
        icon: <LockIcon className="size-3" />,
      },
      {
        value: 'shield',
        label: 'Privacy Controls',
        description: 'Manage privacy settings',
        icon: <ShieldIcon className="size-3" />,
      },
    ],
    defaultValue: 'user',
    size: 'sm',
    placeholder: 'Select a module...',
  },
};

// ============================================================================
// With Trigger Labels
// ============================================================================

export const WithTriggerLabels: Story = {
  args: {
    items: [
      {
        value: 'web',
        label: (
          <span className="flex items-center gap-2">
            <GlobeIcon className="size-3" />
            Web Development
          </span>
        ),
        triggerLabel: 'Web',
      },
      {
        value: 'code',
        label: (
          <span className="flex items-center gap-2">
            <CodeIcon className="size-3" />
            Software Engineering
          </span>
        ),
        triggerLabel: 'Software',
      },
      {
        value: 'data',
        label: (
          <span className="flex items-center gap-2">
            <DatabaseIcon className="size-3" />
            Data Science
          </span>
        ),
        triggerLabel: 'Data',
      },
    ],
    defaultValue: 'web',
  },
};

// ============================================================================
// With Groups
// ============================================================================

export const WithGroups: Story = {
  args: {
    items: [
      { value: 'react', label: 'React', group: 'Frontend' },
      { value: 'vue', label: 'Vue', group: 'Frontend' },
      { value: 'angular', label: 'Angular', group: 'Frontend' },
      { value: 'node', label: 'Node.js', group: 'Backend' },
      { value: 'python', label: 'Python', group: 'Backend' },
      { value: 'go', label: 'Go', group: 'Backend' },
    ],
    defaultValue: 'react',
    size: 'sm',
  },
};

// ============================================================================
// With Separators
// ============================================================================

export const WithSeparators: Story = {
  args: {
    items: [
      { value: 'new', label: 'New File' },
      { value: 'open', label: 'Open File' },
      { type: 'separator' },
      { value: 'save', label: 'Save' },
      { value: 'saveas', label: 'Save As...' },
      { type: 'separator' },
      { value: 'exit', label: 'Exit' },
    ],
    defaultValue: 'new',
  },
};

// ============================================================================
// Disabled States
// ============================================================================

export const Disabled: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
    ],
    defaultValue: 'option1',
    disabled: true,
  },
};

export const DisabledItems: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2 (Disabled)', disabled: true },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
  },
};

// ============================================================================
// Object Values
// ============================================================================

interface ShippingMethod {
  id: string;
  name: string;
  duration: string;
  price: string;
}

const shippingMethods: ShippingMethod[] = [
  { id: 'standard', name: 'Standard', duration: '4-6 days', price: '$4.99' },
  { id: 'express', name: 'Express', duration: '2-3 days', price: '$9.99' },
  { id: 'overnight', name: 'Overnight', duration: 'Next day', price: '$19.99' },
];

const ObjectValuesTemplate = (args: SelectProps<ShippingMethod>) => {
  return (
    <Select<ShippingMethod>
      {...args}
      items={shippingMethods.map((method) => ({
        value: method,
        label: method.name,
        description: `${method.duration} - ${method.price}`,
      }))}
      defaultValue={shippingMethods[0]}
      renderValue={(method) => (
        <span>
          {method.name} ({method.price})
        </span>
      )}
    />
  );
};

export const ObjectValues: Story = {
  render: ObjectValuesTemplate as any,
  args: {
    items: [],
    size: 'sm',
  },
};

// ============================================================================
// Multiple Selection
// ============================================================================

const MultipleSelectionTemplate = (args: SelectProps<string, true>) => {
  return (
    <Select<string, true>
      {...args}
      multiple
      items={[
        { value: 'javascript', label: 'JavaScript' },
        { value: 'typescript', label: 'TypeScript' },
        { value: 'python', label: 'Python' },
        { value: 'rust', label: 'Rust' },
        { value: 'go', label: 'Go' },
      ]}
      defaultValue={['javascript', 'typescript']}
      placeholder="Select languages..."
    />
  );
};

export const MultipleSelection: Story = {
  render: MultipleSelectionTemplate as any,
  args: {
    items: [],
    size: 'sm',
  },
};

// ============================================================================
// Custom Render Item
// ============================================================================

const CustomRenderItemTemplate = (args: SelectProps<string>) => {
  const items: SelectItem<string>[] = [
    {
      value: 'aws',
      label: 'Amazon Web Services',
      icon: <CloudIcon className="size-4" />,
    },
    {
      value: 'gcp',
      label: 'Google Cloud Platform',
      icon: <CloudIcon className="size-4" />,
    },
    {
      value: 'azure',
      label: 'Microsoft Azure',
      icon: <CloudIcon className="size-4" />,
    },
  ];

  return (
    <Select<string>
      {...args}
      items={items}
      defaultValue="aws"
      renderItem={(item) => (
        <div className="flex items-center gap-3">
          <div className="flex size-6 items-center justify-center rounded-md bg-surface-2">
            {item.icon}
          </div>
          <div className="flex flex-col">
            <span className="font-medium">{item.label}</span>
            <span className="text-muted-foreground text-xs">
              Cloud Provider
            </span>
          </div>
        </div>
      )}
    />
  );
};

export const CustomRenderItem: Story = {
  render: CustomRenderItemTemplate as any,
  args: {
    items: [],
    size: 'md',
  },
};

// ============================================================================
// Positioning
// ============================================================================

export const PositionTop: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
    side: 'top',
  },
  decorators: [
    (Story) => (
      <div className="pt-48">
        <Story />
      </div>
    ),
  ],
};

export const PositionRight: Story = {
  args: {
    items: [
      { value: 'option1', label: 'Option 1' },
      { value: 'option2', label: 'Option 2' },
      { value: 'option3', label: 'Option 3' },
    ],
    defaultValue: 'option1',
    side: 'right',
  },
};

// ============================================================================
// Complex Example
// ============================================================================

const ComplexExampleTemplate = () => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Environment:</span>
        <Select
          items={[
            {
              value: 'development',
              label: 'Development',
              icon: <CodeIcon className="size-3" />,
            },
            {
              value: 'staging',
              label: 'Staging',
              icon: <DatabaseIcon className="size-3" />,
            },
            {
              value: 'production',
              label: 'Production',
              icon: <GlobeIcon className="size-3" />,
            },
          ]}
          defaultValue="development"
          size="xs"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Region:</span>
        <Select
          items={[
            { value: 'us-east', label: 'US East', group: 'North America' },
            { value: 'us-west', label: 'US West', group: 'North America' },
            { value: 'eu-west', label: 'EU West', group: 'Europe' },
            { value: 'eu-central', label: 'EU Central', group: 'Europe' },
            { value: 'ap-east', label: 'AP East', group: 'Asia Pacific' },
            { value: 'ap-south', label: 'AP South', group: 'Asia Pacific' },
          ]}
          defaultValue="us-east"
          size="xs"
          triggerVariant="secondary"
        />
      </div>
    </div>
  );
};

export const ComplexExample: Story = {
  render: ComplexExampleTemplate,
  args: {
    items: [],
  },
};

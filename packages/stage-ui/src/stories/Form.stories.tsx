import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Form,
  FormFieldset,
  FormField,
  FormFieldLabel,
  FormFieldDescription,
  FormFieldError,
} from '../components/form';
import { Input } from '../components/input';
import { Switch } from '../components/switch';
import { Button } from '../components/button';

const meta = {
  title: 'Example/Form',
  component: Form,
  parameters: {},
  tags: ['autodocs'],
  render: () => (
    <Form onSubmit={(e) => e.preventDefault()}>
      <FormFieldset title="Account Settings">
        <FormField name="username">
          <FormFieldLabel>Username</FormFieldLabel>
          <FormFieldDescription>
            Choose a unique username for your account
          </FormFieldDescription>
          <Input placeholder="Enter username" />
        </FormField>
        <FormField name="email">
          <FormFieldLabel>Email</FormFieldLabel>
          <Input placeholder="Enter email" type="email" />
        </FormField>
      </FormFieldset>
      <FormFieldset title="Preferences">
        <FormField name="notifications">
          <div className="flex items-center justify-between">
            <div>
              <FormFieldLabel>Enable Notifications</FormFieldLabel>
              <FormFieldDescription>
                Receive email notifications about your account
              </FormFieldDescription>
            </div>
            <Switch />
          </div>
        </FormField>
      </FormFieldset>
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary">
          Save Changes
        </Button>
        <Button type="button" variant="secondary">
          Cancel
        </Button>
      </div>
    </Form>
  ),
} satisfies Meta<typeof Form>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithErrors: Story = {
  render: () => (
    <Form onSubmit={(e) => e.preventDefault()}>
      <FormFieldset title="Account Settings">
        <FormField name="username" invalid>
          <FormFieldLabel>Username</FormFieldLabel>
          <FormFieldDescription>
            Choose a unique username for your account
          </FormFieldDescription>
          <Input placeholder="Enter username" />
          <FormFieldError>Username is already taken</FormFieldError>
        </FormField>
        <FormField name="email" invalid>
          <FormFieldLabel>Email</FormFieldLabel>
          <Input placeholder="Enter email" type="email" />
          <FormFieldError>Please enter a valid email address</FormFieldError>
        </FormField>
      </FormFieldset>
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary">
          Save Changes
        </Button>
        <Button type="button" variant="secondary">
          Cancel
        </Button>
      </div>
    </Form>
  ),
};

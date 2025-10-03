import {
  Form as FormBase,
  Fieldset as FieldsetBase,
  Field as FieldBase,
} from '@base-ui-components/react';
import { cn } from '../lib/utils';

export type FormProps = React.ComponentProps<typeof FormBase>;
export function Form({ className, ...props }: FormProps) {
  return (
    <FormBase
      {...props}
      className={cn('flex flex-col items-stretch gap-4', className)}
    />
  );
}

export type FormFieldsetProps = React.ComponentProps<
  typeof FieldsetBase.Root
> & {
  title: string;
};
export function FormFieldset({
  children,
  className,
  title,
  ...props
}: FormFieldsetProps) {
  return (
    <FieldsetBase.Root
      className={cn('flex flex-col items-stretch gap-4', className)}
      {...props}
    >
      <FieldsetBase.Legend className="border-gray-200 border-b pb-2 font-medium text-base text-foreground">
        {title}
      </FieldsetBase.Legend>
      {children}
    </FieldsetBase.Root>
  );
}

export type FormFieldProps = React.ComponentProps<typeof FieldBase.Root>;
export function FormField({ children, className, ...props }: FormFieldProps) {
  return (
    <FieldBase.Root
      {...props}
      className={cn('flex w-full flex-col items-start gap-2', className)}
    >
      {children}
    </FieldBase.Root>
  );
}

export type FormFieldLabelProps = React.ComponentProps<typeof FieldBase.Label>;
export function FormFieldLabel({ className, ...props }: FormFieldLabelProps) {
  return (
    <FieldBase.Label
      className={cn('font-medium text-foreground text-sm', className)}
      {...props}
    />
  );
}

export type FormFieldDescriptionProps = React.ComponentProps<
  typeof FieldBase.Description
>;
export function FormFieldDescription({
  className,
  ...props
}: FormFieldDescriptionProps) {
  return (
    <FieldBase.Description
      className={cn('-mt-1.5 text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export type FormFieldErrorProps = React.ComponentProps<typeof FieldBase.Error>;
export function FormFieldError({ className, ...props }: FormFieldErrorProps) {
  return (
    <FieldBase.Error
      className={cn('text-rose-600 text-sm dark:text-rose-400', className)}
      {...props}
    />
  );
}

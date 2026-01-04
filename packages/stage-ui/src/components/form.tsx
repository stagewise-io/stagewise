import {
  Form as FormBase,
  Fieldset as FieldsetBase,
  Field as FieldBase,
} from '@base-ui/react';
import { cn } from '../lib/utils';

export type FormProps = React.ComponentProps<typeof FormBase>;
export function Form({ className, ...props }: FormProps) {
  return (
    <FormBase
      {...props}
      className={cn('flex flex-col items-stretch gap-8', className)}
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
      className={cn(
        'mt-10 flex flex-col items-stretch gap-4 first:mt-0',
        className,
      )}
      {...props}
    >
      <FieldsetBase.Legend className="font-semibold text-base text-foreground">
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
      className={cn(
        '-mb-1 font-medium text-foreground text-sm has-data-checked:border-primary has-data-checked:bg-primary/5',
        className,
      )}
      {...props}
    />
  );
}

export type FormFieldTitleProps = React.ComponentProps<
  typeof FieldBase.Description
>;
export function FormFieldTitle({ className, ...props }: FormFieldTitleProps) {
  return (
    <FieldBase.Description
      className={cn('-mb-1 font-medium text-foreground text-sm', className)}
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
      className={cn('font-normal text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export type FormFieldErrorProps = React.ComponentProps<typeof FieldBase.Error>;
export function FormFieldError({ className, ...props }: FormFieldErrorProps) {
  return (
    <FieldBase.Error
      className={cn('text-error text-sm', className)}
      {...props}
    />
  );
}

export function FormFieldSeparator({
  orientation = 'horizontal',
}: {
  orientation?: 'horizontal' | 'vertical';
}) {
  return (
    <hr
      className={cn(
        'block max-h-full max-w-full border-none bg-border/20',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      )}
    />
  );
}

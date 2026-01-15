import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ComponentProps,
} from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Form,
  FormField,
  FormFieldLabel,
} from '@stagewise/stage-ui/components/form';
import { useKartonProcedure } from '@/hooks/use-karton';
import type { AuthenticationRequest } from '@shared/karton-contracts/ui';
import { IconLockKeyFillDuo18 } from 'nucleo-ui-fill-duo-18';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@stagewise/stage-ui/components/dialog';

interface BasicAuthDialogProps {
  request: AuthenticationRequest;
  container?: ComponentProps<typeof DialogContent>['container'];
}

export function BasicAuthDialog({ request, container }: BasicAuthDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  const submitAuth = useKartonProcedure((p) => p.browser.auth.submit);
  const cancelAuth = useKartonProcedure((p) => p.browser.auth.cancel);

  const movePanelToForeground = useKartonProcedure(
    (p) => p.browser.layout.movePanelToForeground,
  );
  useEffect(() => {
    void movePanelToForeground('stagewise-ui');
  }, [movePanelToForeground]);

  // Auto-focus username input when dialog appears
  useEffect(() => {
    // Small delay to ensure the dialog is rendered
    const timeout = setTimeout(() => {
      usernameInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timeout);
  }, [request.id]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitAuth(request.id, username, password);
    } finally {
      setIsSubmitting(false);
    }
  }, [submitAuth, request.id, username, password, isSubmitting]);

  const handleCancel = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await cancelAuth(request.id);
    } finally {
      setIsSubmitting(false);
    }
  }, [cancelAuth, request.id, isSubmitting]);

  return (
    <Dialog open modal={false}>
      <DialogContent container={container}>
        <DialogClose onClick={handleCancel} />
        {/* Header */}

        <DialogHeader>
          <div className="flex size-8 items-center justify-center rounded-full bg-surface-1">
            <IconLockKeyFillDuo18 className="size-4 text-primary-foreground" />
          </div>
          <DialogTitle>Sign in required</DialogTitle>
          <DialogDescription>{request.host}</DialogDescription>
        </DialogHeader>

        {/* Realm info display */}
        {request.realm && (
          <div className="-mt-4 rounded-md bg-surface-1 px-3 py-3">
            <p className="mt-1 text-muted-foreground text-xs">
              Realm: {request.realm}
            </p>
          </div>
        )}

        {/* Form */}
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <FormField>
            <FormFieldLabel>Username</FormFieldLabel>
            <Input
              autoFocus
              ref={usernameInputRef}
              type="text"
              value={username}
              onValueChange={setUsername}
              placeholder="Enter username"
              autoComplete="username"
              disabled={isSubmitting}
            />
          </FormField>

          <FormField>
            <FormFieldLabel>Password</FormFieldLabel>
            <Input
              type="password"
              value={password}
              onValueChange={setPassword}
              placeholder="Enter password"
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </FormField>
        </Form>

        {/* Actions */}
        <DialogFooter>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            Sign in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

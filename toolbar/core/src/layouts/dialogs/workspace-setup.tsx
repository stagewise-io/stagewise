import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@stagewise/stage-ui/components/dialog';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { useState, useCallback, useRef } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Form,
  FormField,
  FormFieldDescription,
  FormFieldLabel,
} from '@stagewise/stage-ui/components/form';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react';

export function WorkspaceSetupDialog() {
  const setupActive = useKartonState((s) => s.workspace?.setupActive) ?? false;
  const loadedOnStart =
    useKartonState((s) => s.workspace?.loadedOnStart) ?? false;
  const [selectedSetupInLoadedOnStart, setSelectedSetupInLoadedOnStart] =
    useState(false);

  const workspacePath = useKartonState((s) => s.workspace?.path);

  const closeWorkspace = useKartonProcedure((p) => p.workspace.close);
  const openWorkspace = useKartonProcedure((p) => p.workspace.open);
  const createFilePickerRequest = useKartonProcedure(
    (p) => p.filePicker.createRequest,
  );

  const submitWorkspaceSetup = useKartonProcedure(
    (p) => p.workspace.setup.submit,
  );

  const openOtherWorkspace = useCallback(() => {
    void createFilePickerRequest({
      title: 'Select a workspace',
      description: 'Select a workspace to load',
      type: 'directory',
      multiple: false,
    })
      .then(async (path) => {
        if (workspacePath) {
          await closeWorkspace();
        }
        await openWorkspace(path[0]!);
      })
      .catch(null);
  }, [createFilePickerRequest, closeWorkspace, openWorkspace, workspacePath]);

  const [appPort, setAppPort] = useState<number | undefined>(undefined);

  const [appPortCheckState, setAppPortCheckState] = useState<
    'checking' | 'available' | 'unavailable' | 'unchecked'
  >('unchecked');

  const appPortCheckTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  const checkForActiveAppOnPort = useKartonProcedure(
    (p) => p.workspace.setup.checkForActiveAppOnPort,
  );
  const onAppPortInputChange = useCallback<
    React.ChangeEventHandler<HTMLInputElement>
  >(
    (ev) => {
      setAppPort(ev.target.valueAsNumber);

      if (appPortCheckTimeout.current) {
        clearTimeout(appPortCheckTimeout.current);
      }

      appPortCheckTimeout.current = setTimeout(() => {
        setAppPortCheckState('checking');
        void checkForActiveAppOnPort(ev.target.valueAsNumber).then((res) => {
          setAppPortCheckState(res ? 'available' : 'unavailable');
        });
        appPortCheckTimeout.current = undefined;
      }, 250);
    },
    [submitWorkspaceSetup, checkForActiveAppOnPort],
  );

  if (!setupActive) return null;

  if (loadedOnStart && !selectedSetupInLoadedOnStart) {
    return (
      <Dialog open={true} dismissible={false} key="setupInLoadedOnStartDialog">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new workspace in this directory?</DialogTitle>
            <DialogDescription>
              stagewise was opened in a directory that doesn't contain a
              workspace configuration file (stagewise.json).
            </DialogDescription>
          </DialogHeader>
          <FormField>
            <FormFieldLabel>Opened directory</FormFieldLabel>
            <Input value={workspacePath} disabled className="font-mono" />
          </FormField>
          <DialogFooter>
            <Button
              variant="primary"
              onClick={() => setSelectedSetupInLoadedOnStart(true)}
            >
              Setup in this directory
            </Button>
            <Button variant="secondary" onClick={openOtherWorkspace}>
              Open existing workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} dismissible={false} key="setupNewWorkspaceDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workspace Setup</DialogTitle>
          <DialogDescription>
            A directory without a configured stagewise workspace was opened.
          </DialogDescription>
        </DialogHeader>
        <Form>
          <FormField>
            <FormFieldLabel>
              Dev Server Port (of the app in this directory)
            </FormFieldLabel>
            <FormFieldDescription>
              stagewise needs to know the port on which your app's dev server is
              running on,
              <br />
              because we display your app in a live preview.{' '}
              <a href="dummy" className="text-blue-500">
                Learn more <ArrowRightIcon className="inline size-3" />
              </a>
              .
            </FormFieldDescription>
            <div className="flex flex-row items-center gap-4">
              <Input
                type="number"
                className="w-48"
                placeholder="e.g. 3000"
                value={appPort}
                onChange={onAppPortInputChange}
              />
              {appPortCheckState === 'checking' && (
                <div className="flex flex-row items-center gap-1 text-sm">
                  <Loader2Icon className="size-3 animate-spin" />
                  <span>Checking for running app...</span>
                </div>
              )}
              {appPortCheckState === 'available' && (
                <div className="flex flex-row items-center gap-1 text-green-600 text-sm dark:text-green-400">
                  <CheckCircleIcon className="size-3" />
                  <span>Running app found!</span>
                </div>
              )}
              {appPortCheckState === 'unavailable' && (
                <div className="flex flex-row items-center gap-1 text-red-600 text-sm dark:text-red-400">
                  <XCircleIcon className="size-3" />
                  <span>
                    No running app found on this port.
                    <br />
                    <span className="text-xs">
                      Have you started your app in dev mode?
                    </span>
                  </span>
                </div>
              )}
            </div>
          </FormField>
        </Form>
        <DialogFooter>
          <Button
            variant="primary"
            onClick={() =>
              void submitWorkspaceSetup({
                appPort: appPort ?? 0,
              })
            }
          >
            Finish setup
          </Button>
          <Button variant="secondary" onClick={openOtherWorkspace}>
            Open existing workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

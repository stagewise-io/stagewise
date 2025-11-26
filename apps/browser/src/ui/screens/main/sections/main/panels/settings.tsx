import {
  FormField,
  FormFieldDescription,
  FormFieldLabel,
  FormFieldset,
  FormFieldTitle,
} from '@stagewise/stage-ui/components/form';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@stagewise/stage-ui/components/tabs';
import { Radio, RadioGroup } from '@stagewise/stage-ui/components/radio';
import { EarthIcon, FolderOpenDotIcon, InfoIcon, PlayIcon } from 'lucide-react';
import { Input } from '@stagewise/stage-ui/components/input';
import type {
  GlobalConfig,
  WorkspaceConfig,
} from '@stagewise/karton-contract/shared-types';
import { startTransition, useCallback, useOptimistic } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { Switch } from '@stagewise/stage-ui/components/switch';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { Select } from '@stagewise/stage-ui/components/select';
import {
  TooltipContent,
  Tooltip,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { IdeLogo } from '@/components/ide-logo';

export const SettingsPanel = () => {
  const workspaceLoaded = useKartonState((s) => s.workspaceStatus === 'open');

  return (
    <div className="glass-body flex size-full flex-col items-stretch justify-start overflow-hidden rounded-xl bg-background p-4">
      <Tabs defaultValue="workspace">
        <TabsList>
          {workspaceLoaded && (
            <TabsTrigger
              title="Workspace"
              icon={<FolderOpenDotIcon className="size-4" />}
              value="workspace"
            />
          )}
          <TabsTrigger
            title="General"
            icon={<EarthIcon className="size-4" />}
            value="global"
          />
        </TabsList>
        <GlobalSettingsTabContent />
        {workspaceLoaded && <WorkspaceSettingsTabContent />}
      </Tabs>
    </div>
  );
};

export const WorkspaceSettingsTabContent = () => {
  const workspacePath = useKartonState((s) => s.workspace?.path);
  const agentAccessPath = useKartonState(
    (s) => s.workspace?.agent?.accessPath ?? 'unknown',
  );

  const _workspaceConfig = useKartonState((s) => s.workspace?.config ?? null);
  const _setWorkspaceConfig = useKartonProcedure((p) => p.workspace.config.set);

  const [config, setConfigOptimistic] = useOptimistic<
    WorkspaceConfig,
    Partial<WorkspaceConfig>
  >(
    _workspaceConfig ?? {
      agentAccessPath: '',
      appPort: 0,
      useAutoFoundAppPort: true,
      eddyMode: undefined,
      autoPlugins: true,
      plugins: [],
      appPath: '',
    },
    (state, update) => {
      const optimisticState = { ...state, ...update };
      return optimisticState;
    },
  );

  const setConfig = useCallback(
    (newConfig: Partial<WorkspaceConfig>) => {
      startTransition(async () => {
        setConfigOptimistic(newConfig);
        await _setWorkspaceConfig({ ...config, ...newConfig });
      });
    },
    [config, setConfigOptimistic, _setWorkspaceConfig],
  );

  const autoFoundAppPort = useKartonState(
    (s) => s.workspace?.devAppStatus?.childProcessOwnedPorts[0],
  );
  const wrappedCommand = useKartonState(
    (s) => s.workspace?.devAppStatus?.wrappedCommand,
  );

  const workspaceDataPath = useKartonState((s) => s.workspace?.paths.data);
  const workspaceTempPath = useKartonState((s) => s.workspace?.paths.temp);

  return (
    <TabsContent
      value="workspace"
      className="-mr-4 scrollbar-subtle h-fit w-full overflow-y-auto p-1 pr-3 pb-16"
    >
      <FormFieldset title="Agent configuration">
        <FormField className="@[700px]:flex-row">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel htmlFor="workspace-path">
              Workspace Path
            </FormFieldLabel>
            <FormFieldDescription>
              The path to the currently loaded workspace.
            </FormFieldDescription>
          </div>
          <Input
            type="text"
            disabled
            id="workspace-path"
            className="@[700px]:w-min w-full @[700px]:min-w-80"
            value={workspacePath}
          />
        </FormField>

        <FormField className="@[700px]:flex-row">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel htmlFor="workspace-agent-access-path">
              Agent access path
            </FormFieldLabel>
            <FormFieldDescription>
              A relative path to workspace path that is used to define access
              for the agent.
              <Popover>
                <PopoverTrigger>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="inline-block"
                  >
                    <InfoIcon className="m-1 inline size-4 text-primary" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="block text-sm">
                  Tip: Use <strong>{'{GIT_REPO_ROOT}'}</strong> to give access
                  to the root of the parent repository.
                </PopoverContent>
              </Popover>
              <br />
              <span className="break-all italic">
                Current access path: <strong>{agentAccessPath}</strong>
              </span>
            </FormFieldDescription>
          </div>
          <Input
            type="text"
            id="workspace-agent-access-path"
            className="@[700px]:w-min w-full @[700px]:min-w-80"
            value={config.agentAccessPath}
            onValueChange={(value) => setConfig({ agentAccessPath: value })}
            debounce={200}
          />
        </FormField>
      </FormFieldset>
      <FormFieldset title="Dev Application setup">
        <FormField className="@[700px]:flex-row">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel htmlFor="dev-application-port">Port</FormFieldLabel>
            <FormFieldDescription>
              The port on which the dev application is running on your machine.
            </FormFieldDescription>
          </div>
          <Input
            type="number"
            id="dev-application-port"
            className="w-28"
            value={config.appPort}
            onValueChange={(value) =>
              setConfig({ appPort: Number.parseInt(value) })
            }
            debounce={200}
          />
        </FormField>
        <FormField className="@[700px]:flex-row">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel htmlFor="dev-application-use-auto-found-port">
              Use automatically found port
            </FormFieldLabel>
            <FormFieldDescription>
              If stagewise starts your app, it can try to determine the port
              automatically and use that instead of the default configured port.
              {autoFoundAppPort && (
                <>
                  <br />
                  <span className="italic">
                    Current automatically found port:{' '}
                    <strong className="font-mono">{autoFoundAppPort}</strong>
                  </span>
                </>
              )}
            </FormFieldDescription>
          </div>
          <Switch
            id="dev-application-use-auto-found-port"
            defaultChecked={config.useAutoFoundAppPort}
            onCheckedChange={(checked) =>
              setConfig({ useAutoFoundAppPort: checked })
            }
          />
        </FormField>
        <FormField className="@[700px]:flex-row">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel htmlFor="dev-application-command">
              Start Command
            </FormFieldLabel>
            <FormFieldDescription>
              The command that should be executed to start the dev application.
              {wrappedCommand && (
                <>
                  <br />
                  <span className="italic">
                    Overriden by wrapped command:{' '}
                    <strong className="font-mono">{wrappedCommand}</strong>
                  </span>
                </>
              )}
            </FormFieldDescription>
          </div>
          <Input
            type="text"
            id="dev-application-command"
            className="@[700px]:w-min w-full @[700px]:min-w-80 font-mono"
            value={config.appExecutionCommand ?? ''}
            onValueChange={(value) =>
              setConfig({
                appExecutionCommand:
                  value.length > 0 ? value.trim() : undefined,
              })
            }
            debounce={200}
            placeholder={'e.g. "dotenv . -- pnpm dev"'}
          />
        </FormField>
      </FormFieldset>
      <FormFieldset title="Other information">
        <FormField className="@[700px]:flex-row">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel>Workspace data path</FormFieldLabel>
            <FormFieldDescription>
              This path is used to store persistent data for the workspace.
            </FormFieldDescription>
          </div>
          <p className="max-w-1/2 select-text break-all text-end font-medium font-mono text-muted-foreground text-sm">
            {workspaceDataPath}
          </p>
        </FormField>

        <FormField className="@[700px]:flex-row">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel>Workspace temp path</FormFieldLabel>
            <FormFieldDescription>
              This path is used to store temporary data for the workspace.
            </FormFieldDescription>
          </div>
          <p className="max-w-1/2 select-text break-all text-end font-medium font-mono text-muted-foreground text-sm">
            {workspaceTempPath}
          </p>
        </FormField>
      </FormFieldset>
    </TabsContent>
  );
};

export const GlobalSettingsTabContent = () => {
  const _globalConfig = useKartonState((s) => s.globalConfig);
  const _setGlobalConfig = useKartonProcedure((p) => p.config.set);
  const isPaidUser = useKartonState((s) => s.userAccount?.subscription?.active);

  const [config, setConfigOptimistic] = useOptimistic<
    GlobalConfig,
    Partial<GlobalConfig>
  >(_globalConfig, (state, update) => {
    const optimisticState = { ...state, ...update };
    return optimisticState;
  });

  const setConfig = useCallback(
    (newConfig: Partial<GlobalConfig>) => {
      startTransition(async () => {
        setConfigOptimistic(newConfig);
        await _setGlobalConfig({ ...config, ...newConfig });
      });
    },
    [config, setConfigOptimistic, _setGlobalConfig],
  );

  return (
    <TabsContent
      value="global"
      className="-mr-4 scrollbar-subtle h-fit w-full overflow-y-auto p-1 pr-3 pb-16"
    >
      <FormFieldset title="IDE Integrations">
        <FormField className="@[700px]:flex-row">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel>Open files in IDE</FormFieldLabel>
            <FormFieldDescription>
              Select the IDE you want to open source files in.
            </FormFieldDescription>
          </div>
          <Select
            onValueChange={(value) => {
              setConfig({
                openFilesInIde: value as GlobalConfig['openFilesInIde'],
              });
            }}
            value={config.openFilesInIde}
            items={[
              {
                value: 'cursor',
                label: 'Cursor',
                icon: <IdeLogo ide="cursor" className="size-4" />,
              },
              {
                value: 'vscode',
                label: 'VS Code',
                icon: <IdeLogo ide="vscode" className="size-4" />,
              },
              {
                value: 'zed',
                label: 'Zed',
                icon: <IdeLogo ide="zed" className="size-4" />,
              },
              {
                value: 'kiro',
                label: 'Kiro',
                icon: <IdeLogo ide="kiro" className="size-4" />,
              },
              {
                value: 'windsurf',
                label: 'Windsurf',
                icon: <IdeLogo ide="windsurf" className="size-4" />,
              },
              {
                value: 'trae',
                label: 'Trae',
                icon: <IdeLogo ide="trae" className="size-4" />,
              },
              {
                value: 'other',
                label: 'Other',
              },
            ]}
            triggerClassName="w-fit @[450px]:min-w-48"
          />
        </FormField>
      </FormFieldset>
      <FormFieldset title="Telemetry">
        <FormField className="w-full flex-col items-stretch">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel>Active Telemetry level</FormFieldLabel>
            <FormFieldDescription>
              Configure how much data you are willing to send to stagewise.{' '}
              <a
                href="https://stagewise.io/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-700"
              >
                Learn more
              </a>
            </FormFieldDescription>
          </div>
          <RadioGroup
            className="grid @[450px]:grid-cols-3 grid-cols-1 gap-3"
            onValueChange={(value) =>
              setConfig({
                telemetryLevel: value as GlobalConfig['telemetryLevel'],
              })
            }
            value={config.telemetryLevel}
          >
            {isPaidUser && (
              <FormFieldLabel
                htmlFor="telemetry-level-off"
                className={`glass-body glass-body-motion glass-body-motion-interactive @[450px]:col-span-1 flex h-full flex-row items-center gap-3 rounded-xl p-3`}
              >
                <div className="flex flex-1 flex-col items-start gap-2">
                  <FormFieldTitle>Off</FormFieldTitle>
                  <FormFieldDescription>
                    Disable any sending of telemetry data.
                  </FormFieldDescription>
                </div>
                <Radio value="off" id="telemetry-level-off" />
              </FormFieldLabel>
            )}

            {!isPaidUser && (
              <Tooltip>
                <TooltipTrigger>
                  <FormFieldLabel
                    htmlFor="telemetry-level-off"
                    className={`glass-body col-span-1 flex h-full cursor-not-allowed flex-row items-center gap-3 rounded-xl p-3 opacity-50`}
                  >
                    <div className="flex flex-1 flex-col items-start gap-2">
                      <FormFieldTitle>Off</FormFieldTitle>
                      <FormFieldDescription>
                        Disable any sending of telemetry data.
                      </FormFieldDescription>
                    </div>
                    <Radio value="off" id="telemetry-level-off" disabled />
                  </FormFieldLabel>
                </TooltipTrigger>
                <TooltipContent>
                  Only paid users can disable telemetry. Upgrade your plan{' '}
                  <a
                    href={`${process.env.STAGEWISE_CONSOLE_URL || 'https://console.stagewise.io'}/billing/checkout`}
                    className="text-blue-600 underline hover:text-blue-700"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    here
                  </a>
                </TooltipContent>
              </Tooltip>
            )}
            <FormFieldLabel
              htmlFor="telemetry-level-anonymous"
              className="glass-body glass-body-interactive glass-body-motion glass-body-motion-interactive col-span-1 flex h-full flex-row items-center gap-3 rounded-xl p-3"
            >
              <div className="flex flex-1 flex-col items-start gap-2">
                <FormFieldLabel>Anonymous</FormFieldLabel>
                <FormFieldDescription>
                  Send reduced and anonymous telemetry data.
                </FormFieldDescription>
              </div>
              <Radio value="anonymous" id="telemetry-level-anonymous" />
            </FormFieldLabel>
            <FormFieldLabel
              htmlFor="telemetry-level-full"
              className="glass-body glass-body-interactive glass-body-motion glass-body-motion-interactive col-span-1 flex h-full flex-row items-center gap-3 rounded-xl p-3"
            >
              <div className="flex flex-1 flex-col items-start gap-2">
                <FormFieldLabel>Full</FormFieldLabel>
                <FormFieldDescription>
                  Send advanced telemetry data (including chats).
                </FormFieldDescription>
              </div>
              <Radio value="full" id="telemetry-level-full" />
            </FormFieldLabel>
          </RadioGroup>
        </FormField>
      </FormFieldset>
      <FormFieldset title="Other">
        <FormField className="@[450px]:flex-row">
          <div className="flex flex-1 flex-col items-start gap-2">
            <FormFieldLabel>Follow us on social media</FormFieldLabel>
            <FormFieldDescription>
              Be first to hear about updates and news around stagewise!
            </FormFieldDescription>
          </div>
          <div className="flex flex-row gap-3">
            <a
              href="https://www.linkedin.com/company/stagewise-io"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({
                  size: 'icon-md',
                  variant: 'primary',
                }),
                'bg-blue-500 pb-px pl-px font-extrabold text-white',
              )}
              aria-label="LinkedIn"
            >
              in
            </a>
            <a
              href="https://x.com/stagewise_io"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({
                  size: 'icon-md',
                  variant: 'primary',
                }),
                'bg-black text-lg text-white',
              )}
              aria-label="X"
            >
              𝕏
            </a>

            <a
              href="https://www.youtube.com/@stagewise-io"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({
                  size: 'icon-md',
                  variant: 'primary',
                }),
                'bg-red-600 pl-0.5 text-white',
              )}
              aria-label="YouTube"
            >
              <PlayIcon className="size-4 fill-current" />
            </a>
          </div>
        </FormField>
      </FormFieldset>
    </TabsContent>
  );
};

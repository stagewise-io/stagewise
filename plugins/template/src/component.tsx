import {
  Panel,
  PanelHeader,
  PanelContent,
  Button,
  useToolbar,
} from '@stagewise/toolbar/plugin-ui';

export const ExampleComponent = () => {
  const toolbar = useToolbar();

  return (
    <Panel>
      <PanelHeader title="Example Plugin" />
      <PanelContent>
        <Button onClick={() => toolbar.sendPrompt('Hello world!')}>
          Send "Hello world!" to Cursor!
        </Button>
      </PanelContent>
    </Panel>
  );
};

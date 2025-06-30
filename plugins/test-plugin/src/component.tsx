import {
  Panel,
  PanelHeader,
  PanelContent,
  Button,
  useToolbar,
} from '@stagewise/toolbar/plugin-ui';

export const ExampleComponent = () => {
  const toolbar = useToolbar();

  console.log(toolbar);

  const component = (
    <Panel>
      <PanelHeader title="Example Plugin" />
      <PanelContent>
        <Button onClick={() => toolbar.sendPrompt('Hello world!')}>
          Send "Hello world!" to Cursor!
        </Button>
      </PanelContent>
    </Panel>
  );

  console.log(component);

  return component;
};

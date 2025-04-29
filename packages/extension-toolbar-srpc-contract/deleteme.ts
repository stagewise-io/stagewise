import { getToolbarBridge } from '.';

async function main() {
  const bridge = await getToolbarBridge('ws://localhost:5746');

  bridge.register({
    test: async (request, sendUpdate) => {
      console.error('\n\n   TOOLBAR RECEIVED REQUEST "test":', request, '\n\n');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      sendUpdate({ updateText: 'test' });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { result: { success: true } };
    },
  });
  await bridge.connect();
  const result = await bridge.call.triggerAgentPrompt(
    {
      prompt: 'Hello, world!',
    },
    {
      onUpdate: (update) => {
        console.error('\n\n   TOOLBAR RECEIVED UPDATE:', update, '\n\n');
      },
    },
  );
  console.error('\n\n   TOOLBAR RECEIVED RESPONSE:', result, '\n\n');
  await bridge.close();
  return;
}

main();

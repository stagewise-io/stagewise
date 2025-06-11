import { dispatchAgentCall } from 'src/utils/dispatch-agent-call';
import * as vscode from 'vscode';

export async function updateToolbar() {
  const prompt = `
<task>
  Update all occurences of the stagewise toolbar to the latest version.
</task>

<context>
  stagewise is a browser toolbar that connects frontend UI to coding AI agents in your code editor. It allows developers to select elements in a web app, leave comments, and let AI agents make changes based on that context.
</context>

<requirements>
    - Call the update method of the user-favored package manger that updates all packages under the scopes "@stagewise/" and "@stagewise-plugins/".
    - Depending on the repository setup (single proejct or monorepo), build a strategy on how to update all packages that use the stagewise toolbar or it's plugins as a (dev)-dependency to the latest version.
      - Packages for the toolbar are either named "@stagewise/toolbar" or "@stagewise/toolbar-[framework-specific-variant]".
      - Plugin packages are named "@stagewise-plugins/[plugin-name]".
      - Update all given packages that you find.
      - Apply the most solid and reliable strategy to thoroughly update all found packages or only stagewise toolbar and it's plugins.
    - Execute your strategy while making sure that the package.json files are also updated to reflect the updated versions.
</requirements>

<expected_outcome>
  All stagewise toolbar and official plugin packages are updated to the latest available versions.
</expected_outcome>`;

  await dispatchAgentCall({
    prompt,
    sessionId: vscode.env.sessionId,
  });
}

import { DEPRECATED_TOOLBAR_PACKAGES } from 'src/services/workspace-service';
import { dispatchAgentCall } from 'src/utils/dispatch-agent-call';

export const removeOldToolbarPrompt = `
<task>
  Remove all existing dependencies (peer, regular and dev) to any package of the old stagewise integration.
</task>

<context>
  The following packages are no longer supported and should be removed:
${DEPRECATED_TOOLBAR_PACKAGES.map((pkg) => `  - ${pkg}`).join('\n')}

Other stagewise packages may be used for other purposes and should thus simply be ignored.
</context>

<next_steps>
After removing the dependencies, try to build the software of the user project and if the build fails, see where the old stagewise integration was used and remove it.
Depending on the used framework in the project of the user, simply remove the calls to "setupToolbar" or the stagewise toolbar components.
</next_steps>
`;

export async function removeOldToolbar() {
  await dispatchAgentCall({
    prompt: removeOldToolbarPrompt,
    files: [],
    images: [],
  });
}

import {
  Panel,
  PanelContent,
  PanelFooter,
  PanelHeader,
} from '@/components/ui/panel';
import {
  DiscordLogo,
  CursorLogoImg,
  TraeLogoImg,
  WindsurfLogoImg,
  ClineLogoImg,
  RooCodeLogoImg,
  GithubCopilotLogoImg,
  KilocodeLogoImg,
} from '@/components/logos';
import { Button } from '@/components/ui/button';
import { useAgents } from '@/hooks/agent/use-agent-provider';

interface Agent {
  id: string;
  name: string;
  domain: string;
  logo: string;
}

const agents: Agent[] = [
  {
    id: 'cursor',
    name: 'Cursor.com',
    domain: 'cursor.com',
    logo: CursorLogoImg,
  },
  {
    id: 'windsurf',
    name: 'Windsurf.com',
    domain: 'windsurf.com',
    logo: WindsurfLogoImg,
  },
  {
    id: 'cline',
    name: 'Cline.bot',
    domain: 'cline.bot',
    logo: ClineLogoImg,
  },
  {
    id: 'roocode',
    name: 'Roo-Code',
    domain: 'roocline.dev/',
    logo: RooCodeLogoImg,
  },
  {
    id: 'trae',
    name: 'Trae',
    domain: 'trae.ai',
    logo: TraeLogoImg,
  },
  {
    id: 'kilocode',
    name: 'Kilo-Code',
    domain: 'kilocode.ai',
    logo: KilocodeLogoImg,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    domain: 'github.com/features/copilot',
    logo: GithubCopilotLogoImg,
  },
];

export function InfoPanel() {
  const { availableAgents, connected } = useAgents();

  const isInstalled = (id: string) => {
    // Get all agents (available + connected)
    const allAgents = [...availableAgents];
    if (connected) {
      allAgents.push(connected);
    }

    // Check if any agent name/description matches the agent id
    return allAgents.some((agent) => {
      const agentNameLower = (agent.name || '').toLowerCase();
      const agentDescLower = (agent.description || '').toLowerCase();
      const searchId = id.toLowerCase();

      // Check for partial matches in name or description
      return (
        agentNameLower.includes(searchId) || agentDescLower.includes(searchId)
      );
    });
  };

  return (
    <Panel>
      <PanelHeader title="Connect Your Agent" />
      <PanelContent className="flex flex-col gap-2 px-3">
        <p className="mb-2 text-sm text-zinc-600 leading-relaxed">
          To connect your agent, simply install the stagewise extension.
        </p>

        <div className="scrollbar-thin scrollbar-thumb-black/15 scrollbar-track-transparent max-h-48 overflow-hidden overflow-y-auto rounded-2xl border border-zinc-200 bg-white">
          {agents.map((agent, index) => (
            <div
              key={agent.id}
              className={`flex items-center justify-between p-2 ${
                index !== agents.length - 1 ? 'border-zinc-100 border-b' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <img
                  src={agent.logo}
                  alt={`${agent.name} logo`}
                  className="size-4 object-contain"
                />
                <span className="font-regular text-sm text-zinc-900">
                  {agent.name}
                </span>
              </div>

              {!isInstalled(agent.id) ? (
                <Button
                  onClick={() => {
                    window.open(
                      `${agent.id}:extension/stagewise.stagewise-vscode-extension`,
                      '_blank',
                    );
                  }}
                  variant="secondary"
                  size="sm"
                  className="h-8 bg-zinc-100 px-4 text-xs hover:bg-zinc-200"
                  glassy
                >
                  Install the extension
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 px-4 text-xs"
                  glassy
                  disabled={true}
                >
                  Connected
                </Button>
              )}
            </div>
          ))}
        </div>
      </PanelContent>
      <PanelFooter>
        <div className="flex w-full items-center justify-center gap-2 py-2">
          <DiscordLogo className="size-4" />
          <a
            className="text-xs text-zinc-600 underline hover:text-zinc-900"
            href="https://discord.gg/gkdGsDYaKA"
            target="_blank"
          >
            Join our Discord!
          </a>
        </div>
      </PanelFooter>
    </Panel>
  );
}

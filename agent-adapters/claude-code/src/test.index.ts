import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { createInterface } from 'node:readline';

class ClaudeCodeCLI {
  private rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  private abortController = new AbortController();

  async start() {
    console.log('🤖 Claude Code CLI Test Tool');
    console.log("Type your prompts and press Enter. Type 'exit' to quit.\n");

    while (true) {
      const userInput = await this.getUserInput('You: ');

      if (userInput.toLowerCase().trim() === 'exit') {
        console.log('👋 Goodbye!');
        break;
      }

      if (userInput.trim() === '') {
        continue;
      }

      await this.queryClaudeCode(userInput);
    }

    this.rl.close();
  }

  private getUserInput(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  private async queryClaudeCode(prompt: string) {
    console.log('\n🔄 Querying Claude Code...\n');

    const messages: SDKMessage[] = [];

    try {
      for await (const message of query({
        prompt,
        abortController: this.abortController,
        options: {
          maxTurns: 30,
          // allowedTools: ['Edit', 'MultiEdit', 'Write'], // Allow to use those tools
          // continue: true, // continue the conversation
        },
      })) {
        if (message.type === 'assistant') {
          if (
            message.message.content.find(
              (c: any) => c.type === 'tool_use' && c.name === 'Edit',
            )
          ) {
            console.error('\t\tEdit tool used');
            this.abortController.abort();
            this.abortController.signal.dispatchEvent(new Event('abort'));
            console.log('\t\tAborted...');
          }
        }

        // Display the message as it comes in
        console.log(`📦 Message ${messages.length}:`);
        console.log(JSON.stringify(message, null, 2));
        console.log('---');
      }

      console.log(
        `\n✅ Query completed! Received ${messages.length} messages.\n`,
      );
    } catch (error) {
      console.error('❌ Error querying Claude Code:');
      console.error(error);
      console.log('');
    }
  }
}

// Start the CLI if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new ClaudeCodeCLI();
  cli.start().catch((error) => {
    console.error('❌ CLI Error:', error);
    process.exit(1);
  });
}

export { ClaudeCodeCLI };

# stagewise for VSCode

[![Version](https://img.shields.io/visual-studio-marketplace/v/stagewise.stagewise)](https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/stagewise.stagewise)](https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/stagewise.stagewise)](https://marketplace.visualstudio.com/items?itemName=stagewise.stagewise)

stagewise is a powerful VSCode extension that enhances your development workflow by providing an interactive toolbar for AI-assisted code improvements and seamless integration with the Model Context Protocol (MCP).

## Features

### 🎯 Interactive Toolbar
- Inject a customizable toolbar into your local development environment
- Annotate code sections directly for AI-Agent improvements
- Real-time feedback and suggestions from the AI assistant

### 🔌 Built-in MCP Server
- Automatic setup of a local Model Context Protocol (MCP) server
- Define and manage custom MCP tools directly from your IDE
- Seamless integration with existing AI workflows

### 🤖 AI-Agent Integration
- Direct communication with the AI assistant
- Context-aware code suggestions
- Automated code improvements based on annotations

## Requirements

- VSCode 1.96.2 or higher
- Node.js 16.x or higher
- A local development environment with localhost access

## Installation

1. Open VSCode
2. Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X)
3. Search for "stagewise"
4. Click Install

## Getting Started

1. Open your project in VSCode
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux) to open the command palette
3. Type "Inject Agent" and select the command to start the stagewise toolbar

## Usage

### Toolbar Injection
The toolbar will be automatically injected into your localhost development environment. To manually inject the toolbar:

1. Open the command palette (`Cmd+Shift+P` or `Ctrl+Shift+P`)
2. Run the "Inject Agent" command

### Code Annotation
1. Select the code you want to improve
2. Use the toolbar to add annotations
3. The AI agent will analyze your annotations and suggest improvements

### MCP Tools
1. Define custom MCP tools in your project
2. Access them directly through the VSCode interface
3. Use them in combination with the AI agent for enhanced functionality

## Commands

- `Inject Agent`: Injects the stagewise toolbar into your development environment
- `Test Cursor Agent Injector` (Cmd+Alt+V): Test the agent injection functionality

## Extension Settings

This extension contributes the following settings:

* `stagewise.enableToolbar`: Enable/disable the development toolbar
* `stagewise.mcpPort`: Configure the port for the MCP server
* `stagewise.autoInject`: Enable/disable automatic toolbar injection

## Known Issues

Please report issues on our [GitHub repository](https://github.com/stagewise/stagewise).

## Contributing

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md) for more details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Release Notes

### 1.0.0
- Initial release of stagewise
- Introduction of the interactive toolbar
- Built-in MCP server functionality
- AI-Agent integration

---

**Enjoy coding with stagewise! 🚀** 
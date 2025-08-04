# Stagewise CLI Architecture

## Overview
The Stagewise CLI is a Node.js application that provides a local development server with proxy capabilities, authentication, and plugin support.

## Directory Structure

```
src/
├── auth/                    # Authentication and OAuth handling
│   ├── oauth.ts            # OAuth flow implementation
│   └── token-manager.ts    # Token storage and management
├── config/                  # Configuration management
│   ├── argparse.ts         # Command-line argument parsing
│   ├── config-file.ts      # Configuration file handling
│   ├── index.ts            # Main configuration resolver
│   ├── telemetry.ts        # Telemetry configuration management
│   └── types.ts            # Configuration type definitions
├── dependency-parser/       # Project dependency discovery
│   ├── index.ts            # Main dependency parser
│   ├── types.ts            # Dependency type definitions
│   └── utils.ts            # Parser utility functions
├── analytics/               # Analytics and telemetry
│   ├── posthog.ts          # PostHog client integration
│   └── events.ts           # Analytics event definitions
├── server/                  # HTTP/WebSocket server implementation
│   ├── agent-loader.ts     # Agent initialization and management
│   ├── error-page.ts       # Error page generation
│   ├── index.ts            # Express server setup
│   ├── plugin-loader.ts    # Plugin discovery and loading
│   └── proxy.ts            # HTTP proxy middleware
├── utils/                   # Utility functions
│   ├── banner.ts           # CLI banner display
│   ├── command-executor.ts # Command execution for proxy mode
│   ├── config-path.ts      # Configuration path management
│   ├── identifier.ts       # Machine identifier management
│   ├── logger.ts           # Logging utilities
│   ├── telemetry.ts        # Telemetry utility functions
│   └── user-input.ts       # User input handling
└── index.ts                # Application entry point
```

## Testing Structure

### Standards
- **Test Framework**: Vitest (consistent across all tests)
- **Test File Pattern**: `*.test.ts`
- **Test Location**: `__tests__` directories within feature folders
- **Test Organization**: Each module should have corresponding tests in its `__tests__` directory

### Current Structure
```
src/
├── auth/
│   ├── __tests__/
│   │   └── token-manager.test.ts
│   ├── oauth.ts
│   └── token-manager.ts
├── config/
│   ├── __tests__/
│   │   └── config-file.test.ts
│   ├── argparse.ts
│   ├── config-file.ts
│   ├── index.ts
│   ├── telemetry.ts
│   └── telemetry.test.ts
├── dependency-parser/
│   ├── __tests__/
│   │   ├── index.test.ts
│   │   └── utils.test.ts
│   ├── index.ts
│   ├── types.ts
│   └── utils.ts
├── server/
│   ├── __tests__/
│   │   └── error-page.test.ts
│   ├── agent-loader.ts
│   ├── error-page.ts
│   ├── index.ts
│   ├── plugin-loader.ts
│   └── proxy.ts
├── utils/
│   ├── __tests__/
│   │   ├── banner.test.ts
│   │   ├── config-path.test.ts
│   │   └── logger.test.ts
│   ├── banner.ts
│   ├── config-path.ts
│   ├── logger.ts
│   └── user-input.ts
└── index.ts
```

### Testing Guidelines
1. **Unit Tests**: Focus on testing individual functions and classes in isolation
2. **Mocking**: Use Vitest's `vi.mock()` for external dependencies
3. **Coverage**: Aim for high test coverage but prioritize critical business logic
4. **Test Naming**: Use descriptive test names that explain what is being tested
5. **Test Structure**: Follow the Arrange-Act-Assert pattern

## Core Components

### 1. Entry Point (`index.ts`)
- Initializes the application
- Handles command execution (auth, telemetry, and proxy commands)
- Sets up the HTTP server
- Manages graceful shutdown
- **Proxy Mode**: Executes external commands while running Stagewise server in background

### 2. Authentication (`auth/`)
- **OAuth Manager**: Handles OAuth2 flow with PKCE
- **Token Manager**: Secure storage using file-based credentials in platform-specific config directory
- Supports login, logout, and status commands

### 3. Telemetry (`config/telemetry.ts`)
- **Telemetry Manager**: Manages telemetry configuration and levels
- Supports three telemetry levels:
  - `off`: Disable telemetry completely
  - `anonymous`: Enable telemetry with pseudonymized ID (default)
  - `full`: Enable telemetry with actual user ID
- Stores configuration in `telemetry.json` in the config directory
- Provides `status` and `set` subcommands for telemetry management

### 4. Configuration (`config/`)
- **Config Resolver**: Merges configuration from multiple sources
- Sources (in priority order):
  1. Command-line arguments
  2. Environment variables
  3. Configuration file (stagewise.config.json)
  4. Default values
- Handles authentication flow initialization
- **Proxy Mode Support**: Provides minimal configuration for command proxying
- **Argument Parser**: Detects double-dash delimiter for command separation

### 5. Server (`server/`)
- **Express Server**: Main HTTP server
- **Agent Loader**: Initializes Stagewise agent for code assistance
- **Proxy**: Proxies requests to the user's application
- **Plugin Loader**: Discovers and loads UI plugins
- **WebSocket Support**: Handles WebSocket connections for agent

### 6. Dependency Parser (`dependency-parser/`)
- Discovers project dependencies from package.json files
- Supports monorepo structures
- Provides dependency information for plugins

### 7. Analytics (`analytics/`)
- **PostHog Client**: Manages PostHog integration with telemetry level support
- **Events Module**: Defines and tracks analytics events:
  - `cli-telemetry-config-set`: Tracks telemetry configuration changes
  - `cli-start`: Tracks CLI startup with mode, workspace, and plugin info
  - `cli-stored-config-json`: Tracks when users save configuration
  - `cli-auth-initiated`: Tracks when authentication flow is started (with `initiated_automatically` property)
  - `cli-auth-completed`: Tracks when authentication is successfully completed (with `initiated_automatically` property)
  - `cli-found-config-json`: Tracks when workspace has existing config
  - `cli-shutdown`: Tracks graceful CLI shutdown
- **Machine Identification**: Uses persistent UUID stored in `identifier.json`
  - Generated on first CLI startup using `crypto.randomUUID()`
  - Initialized early in the startup sequence to ensure it exists before any analytics events
  - Stored in the data directory with creation timestamp
- **Privacy Levels**: Respects telemetry settings (off/anonymous/full)

### 8. Utilities (`utils/`)
- **Logger**: Winston-based logging with different levels
- **Banner**: ASCII art banner display
- **User Input**: Terminal input handling
- **Config Path**: Platform-specific configuration directory management using env-paths
- **Identifier Manager**: Creates and manages persistent machine ID
- **Telemetry Utils**: Helper functions for telemetry status checks
- **Command Executor**: Manages child process execution for proxy mode
  - Cross-platform command spawning
  - Signal forwarding (SIGINT, SIGTERM)
  - Graceful shutdown with timeout
  - Real-time output streaming

## CLI Commands

### Main Command
```
stagewise [options] [-- <command>]
```

Starts the Stagewise development proxy server.

**Options:**
- `-p, --port <port>`: The port on which the stagewise-wrapped app will run
- `-a, --app-port <app-port>`: The port of the developed app that stagewise will wrap with the toolbar
- `-w, --workspace <workspace>`: The path to the repository of the developed app (default: current directory)
- `-s, --silent`: Will not request user input or guide through setup
- `-v, --verbose`: Output debug information to the CLI
- `-t, --token <token>`: If set, will use the given auth token instead of using or asked for a stored one
- `-b`: Bridge mode - will not start the coding agent server

### Proxy Mode
```
stagewise [options] -- <command> [args...]
```

Runs a command while starting Stagewise server in the background. Similar to dotenv-cli pattern.

**Examples:**
- `stagewise -- npm run build`
- `stagewise -p 3100 -- tsx src/build.ts --watch`
- `stagewise -- node script.js --flag value`

**Features:**
- Executes command with real-time output
- Forwards exit codes from proxied command
- Handles signal forwarding (Ctrl+C, etc.)
- Runs Stagewise server concurrently
- Minimal configuration required

### Auth Command
```
stagewise auth <subcommand>
```

Manage authentication for Stagewise CLI.

**Subcommands:**
- `login`: Authenticate with Stagewise
- `logout`: Clear stored authentication tokens
- `status`: Check authentication status

### Telemetry Command
```
stagewise telemetry <subcommand>
```

Manage telemetry settings for Stagewise CLI. Telemetry tracks usage metrics and failure events without capturing request content.

**Subcommands:**
- `status`: Show current telemetry configuration
- `set <level>`: Set telemetry level
  - `off`: Disable telemetry completely
  - `anonymous`: Enable telemetry with pseudonymized ID (default)
  - `full`: Enable telemetry with actual user ID

## Execution Modes

The CLI supports three distinct execution modes:

### 1. Standard Mode
Default mode when no special flags or commands are provided.
- Starts Stagewise server
- Requires app-port configuration
- Requires authentication (unless in bridge mode)
- Interactive setup if configuration is missing

### 2. Bridge Mode (`-b` flag)
Lightweight mode that disables the agent server.
- Starts proxy server only
- No authentication required
- Still requires app-port for proxying
- Suitable for environments where agent features aren't needed

### 3. Proxy Mode (`-- command`)
Executes external commands while running Stagewise in background.
- Detects double-dash delimiter in arguments
- Runs Stagewise server concurrently with user command
- Forwards stdio streams from proxied command
- Returns exit code of proxied command
- Minimal configuration (uses defaults when possible)
- Silent mode enabled by default

## Key Features

### Graceful Shutdown
- Handles SIGINT and SIGTERM signals
- Closes WebSocket connections
- Shuts down agent properly
- Forces exit after 5-second timeout

### Plugin System
- Loads plugins from npm packages
- Checks plugin compatibility with project dependencies
- Serves plugin files via Express static middleware
- Generates dynamic import maps for plugins

### Development Proxy
- Proxies non-toolbar requests to user's application
- Handles WebSocket upgrades
- Preserves headers and cookies
- Shows error page when proxied app is unavailable

## Build and Distribution
- Uses ESBuild for bundling
- Bundles most dependencies including env-paths
- Keeps problematic dependencies external (workspace packages)
- Extracts third-party licenses
- Copies static assets (toolbar, plugins)

## Configuration Storage
- Uses platform-specific directories via env-paths
- Stores credentials in JSON file with restricted permissions (0600)
- **Dev Mode Detection**: Automatically uses separate config directory in development
  - Production: Uses `stagewise` app name for env-paths
  - Development: Uses `stagewise-dev` app name for env-paths
  - Detection methods:
    - Checks if `NODE_ENV !== 'production'`
    - Checks if running with tsx (`process.execArgv` contains 'tsx')
- Configuration directory structure:
  - `config/`: Application configuration files
    - `telemetry.json`: Telemetry level configuration
    - `credentials.json`: Authentication tokens
  - `data/`: Application data files
    - `identifier.json`: Machine identifier for analytics
  - `cache/`: Temporary cache files
  - `log/`: Log files
  - `temp/`: Temporary files

## Analytics and Telemetry
- Uses PostHog for analytics tracking
- Telemetry levels control data collection:
  - `off`: No data collection
  - `anonymous`: Pseudonymized machine ID only (default)
  - `full`: Includes authenticated user information
- Events tracked:
  - CLI startup and configuration
  - Telemetry preference changes
  - Configuration file operations
  - Authentication flow initiation and completion
  - Graceful shutdown
- Privacy-first approach with opt-out capability
- API key configured via `POSTHOG_API_KEY` environment variable
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
- Handles command routing (auth, telemetry, and main server commands)
- Manages execution mode detection and configuration resolution
- Sets up the HTTP server with Express
- Manages graceful shutdown with signal handling
- **Command Wrapping**: Executes external commands via CommandExecutor while running Stagewise server concurrently

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
- Handles authentication flow initialization and interactive setup
- **Command Wrapping Support**: Provides minimal configuration for wrapped command execution
- **Argument Parser**: Uses Commander.js with double-dash delimiter detection for command separation
- **Cross-platform Validation**: Port conflict detection and path validation

### 5. Server (`server/`)
- **Express Server**: Main HTTP server with middleware pipeline
- **Agent Loader**: Initializes Stagewise agent with WebSocket support (disabled in bridge mode)
- **HTTP Proxy**: Proxies non-toolbar requests to user's application with header preservation
- **Plugin Loader**: Discovers and loads framework-specific UI plugins with dependency compatibility checking
- **WebSocket Support**: Handles WebSocket connections for agent communication and proxy upgrades
- **Error Handling**: Custom error pages when proxied application is unavailable

### 6. Dependency Parser (`dependency-parser/`)
- Discovers project dependencies from package.json files
- Supports monorepo structures
- Provides dependency information for plugins

### 7. Analytics (`analytics/` and `utils/telemetry.ts`)
- **TelemetryManager**: Centralized telemetry management with privacy-first approach
- **PostHog Integration**: Configured via `POSTHOG_API_KEY` environment variable
- **Three Privacy Levels**:
  - `off`: Complete data collection disabled
  - `anonymous`: Pseudonymized machine ID only (default)
  - `full`: Includes authenticated user information
- **Analytics Events**: Comprehensive event tracking including:
  - `cli-telemetry-config-set`: Telemetry configuration changes
  - `cli-start`: CLI startup with mode, workspace, and plugin metadata
  - `cli-stored-config-json`: Configuration file creation
  - `cli-auth-initiated/completed`: Authentication flow tracking
  - `cli-found-config-json`: Existing workspace configuration detection
  - `cli-shutdown`: Graceful shutdown tracking
- **Machine Identification**: Persistent UUID in `identifier.json`
  - Generated using `crypto.randomUUID()` on first startup
  - Stored in platform-specific data directory
  - Separate identifiers for dev vs production environments

### 8. Utilities (`utils/`)
- **Logger**: Winston-based logging with configurable levels and formatting
- **Banner**: ASCII art banner display with mode-specific information
- **User Input**: Terminal input handling for interactive setup flows
- **Config Path**: Platform-specific directory management using env-paths
  - Separate directories for dev vs production environments
  - Automatic dev mode detection via NODE_ENV and tsx execution
- **Identifier Manager**: Creates and manages persistent machine ID for analytics
- **Telemetry Manager**: Centralized telemetry configuration and event tracking
- **Command Executor**: Manages child process execution for command wrapping mode
  - Cross-platform command spawning with proper shell detection
  - Signal forwarding (SIGINT, SIGTERM) between parent and child processes
  - Graceful shutdown with timeout handling
  - Real-time stdio streaming (stdout/stderr)
  - Exit code forwarding from wrapped command to CLI process

## CLI Commands

### Main Command
```
stagewise [options] [-- <command>]
```

Starts the Stagewise development server with toolbar integration.

**Options:**
- `-p, --port <port>`: Port for the Stagewise server (default: 3000)
- `-a, --app-port <app-port>`: Port of your application that Stagewise will proxy and enhance with toolbar
- `-w, --workspace <workspace>`: Path to your application's repository (default: current directory)
- `-s, --silent`: Disable interactive prompts and setup guidance
- `-v, --verbose`: Enable debug logging and detailed output
- `-t, --token <token>`: Use specific authentication token instead of stored credentials
- `-b, --bridge`: Enable bridge mode (toolbar-only, no agent server)
- `--auto-plugins`: Automatically load framework-specific plugins based on dependencies
- `--plugins <plugins>`: Comma-separated list of manual plugin names to load

### Command Wrapping Mode
```
stagewise [options] -- <command> [args...]
```

Executes external commands while running Stagewise server concurrently in the background. Uses double-dash delimiter pattern similar to dotenv-cli.

**Examples:**
- `stagewise -- npm run dev`
- `stagewise -p 3100 -- tsx src/build.ts --watch`
- `stagewise -- node script.js --flag value`
- `stagewise -b -- pnpm build` (bridge mode with command wrapping)

**Features:**
- Executes wrapped command with real-time stdio streaming
- Forwards exit codes from wrapped command to CLI process
- Handles cross-platform signal forwarding (SIGINT, SIGTERM)
- Runs Stagewise server concurrently in background
- Minimal configuration required (silent mode enabled by default)
- Works with both standard and bridge modes

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
- Starts full Stagewise server with agent capabilities
- Requires app-port configuration for proxying
- Requires authentication for agent features
- Interactive setup if configuration is missing
- Opens browser automatically to the Stagewise interface

### 2. Bridge Mode (`-b` flag)
Lightweight mode that disables the agent server.
- Starts proxy server only (no agent capabilities)
- No authentication required
- Still requires app-port for proxying user's application
- Suitable for environments where agent features aren't needed
- Reduces resource usage and startup time

### 3. Command Wrapping Mode (`-- command`)
Executes external commands while running Stagewise server concurrently.
- Uses double-dash delimiter pattern (similar to dotenv-cli)
- Runs Stagewise server in background while executing user command
- Forwards stdio streams and signals from wrapped command
- Returns exit code of wrapped command
- Minimal configuration (uses defaults when possible)
- Silent mode enabled by default
- Examples: `stagewise -- npm run dev`, `stagewise -p 3100 -- tsx build.ts`

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
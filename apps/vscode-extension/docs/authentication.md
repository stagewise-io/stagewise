# VSCode Extension Authentication

This document describes the authentication flow implemented for the Stagewise VSCode extension.

## Overview

The extension supports OAuth-like authentication where users authenticate through the Stagewise console web app and are automatically logged into the VSCode extension.

## Authentication Flow

1. **User initiates authentication** either by:
   - Clicking "Authenticate IDE" in the Stagewise console
   - Running the `stagewise.authenticate` command in VSCode

2. **Token generation** (console side):
   - Console generates a secure 64-character hex token via `POST /auth/ide-token`
   - Token expires after 5 minutes

3. **Extension activation**:
   - Extension opens with URI: `vscode://stagewise.stagewise-vscode/authenticate?token={token}&userId={userId}`
   - URI handler extracts token and userId parameters

4. **Token validation**:
   - Extension validates token with backend: `POST /api/auth/validate-extension-token`
   - Backend verifies token and returns session information

5. **Session storage**:
   - Validated session stored in VSCode's storage
   - Authentication headers included in subsequent API calls

## Commands

- `stagewise.authenticate` - Manual authentication trigger
- `stagewise.logout` - Clear stored credentials  
- `stagewise.checkAuthStatus` - Display current auth status

## API Integration

Use the `AuthService` for authenticated API calls:

```typescript
import { AuthService } from './services/auth-service';

const authService = AuthService.getInstance();

// Check if authenticated
const isAuth = await authService.isAuthenticated();

// Make authenticated request
const data = await authService.makeAuthenticatedRequest({
  method: 'GET',
  url: 'https://api.stagewise.io/api/user/profile'
});

// Get auth headers for custom requests
const headers = await authService.getAuthHeaders();
```

## Error Handling

- **Token expiration**: Tokens expire after 5 minutes. Users are prompted to retry.
- **Network errors**: Clear error messages with retry options
- **401 responses**: Automatically logout and prompt re-authentication

## Security

- Tokens stored in VSCode's SecretStorage for sensitive data
- Authentication state stored in extension's GlobalStorage
- Tokens are single-use and expire quickly
- All API calls use HTTPS

## Multi-IDE Support

The extension supports multiple IDEs that use the VSCode extension protocol:
- VSCode
- Cursor
- Windsurf  
- Trae

All use the same `vscode://` URI scheme for authentication.
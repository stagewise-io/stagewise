---
"stagewise-vscode-extension": minor
"@stagewise/plugin-example": minor
"@stagewise-plugins/react": minor
"@stagewise/toolbar-react": minor
"@stagewise/toolbar": minor
"@stagewise/toolbar-next": minor
"@stagewise/toolbar-vue": minor
---

Add HTTPS support for extension server to resolve mixed content errors

- Add optional HTTPS server support with self-signed certificates
- Add extension settings to toggle HTTPS on/off
- Add toolbar configuration options for protocol preference ('auto', 'https', 'http')
- Implement smart protocol discovery (HTTPS first, fallback to HTTP)
- Add certificate management utilities and VSCode commands
- Include comprehensive setup documentation and troubleshooting guide

This resolves mixed content errors when using Stagewise with HTTPS development servers while maintaining full backward compatibility with existing HTTP-only setups.

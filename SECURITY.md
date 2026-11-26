# Sudhir Browser AI — Security Policy

## Overview

Sudhir Browser AI is designed with security as a first-class concern. This document describes the threat model, security controls, and responsible disclosure process.

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Unauthorized MCP client connecting to bridge | Shared-secret auth token required on WebSocket handshake |
| Prompt injection from web page content | Web page content is treated as untrusted data, never executed as instructions |
| Password/secret extraction | Password and sensitive form fields are never read or transmitted |
| Unbounded automation loops | MAX_AUTO_ACTIONS limit (default: 50 per task) |
| Cross-origin session leakage | Per-tab permission model; no cross-window ambient access |
| Malicious website triggering dangerous actions | Dangerous actions require explicit user confirmation |
| Local network port scanning | Only ws://127.0.0.1:7483 is used; connection requires auth token |

## Controls

### Authentication
- Bridge WebSocket server requires a shared-secret token on first message
- Token is generated with 32 random bytes (256 bits of entropy)
- Constant-time comparison prevents timing attacks

### Browser Permissions
- Extension only accesses tabs the user has granted permission for
- No ambient access to private/incognito windows
- Keyboard shortcut to emergency-stop all automation

### Sensitive Data Protection
- Password fields (`type="password"`) are never read or filled via automation
- Credit card, SSN, CVV, PIN fields are blocked
- Payment checkout flows require explicit user confirmation

### Prompt Injection Prevention
- Web page text content is passed to AI as `<page_content>` context, not as system instructions
- The extension validates all incoming command schemas before execution
- Domain blocklist prevents automation on banking, government, and medical sites by default

### Network Security
- All bridge communication is on localhost only (127.0.0.1)
- No external connections from the bridge process
- WebSocket origin is validated to be from the extension

## Responsible Disclosure

Report security vulnerabilities to: security@drishti-browser-ai.local

Please do not open public GitHub issues for security vulnerabilities.

## License

MIT — see LICENSE file.

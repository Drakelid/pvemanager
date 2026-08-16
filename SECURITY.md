# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.16.x (latest) | :white_check_mark: |
| < 1.16 | :x: |

Only the latest minor release receives security patches. We recommend always running the most recent version.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Please report them privately via email: **rasulovd9309@gmail.com**

Include as much detail as possible:

- Description of the vulnerability
- Steps to reproduce
- Affected component (backend, frontend, nginx, Docker config)
- Potential impact
- Suggested fix (if any)

### What to Expect

- **Acknowledgement** within 48 hours.
- **Status update** within 7 days with an initial assessment.
- If confirmed, a fix will be developed and released as a patch version. You will be credited in the release notes (unless you prefer to remain anonymous).
- If declined, we will explain why.

## Scope

The following are in scope:

- Authentication and authorization bypass
- SQL injection, command injection, SSRF
- Credential or secret exposure
- Cross-site scripting (XSS) and CSRF
- Proxmox API token or session leakage
- Container escape or privilege escalation
- Insecure default configurations

Out of scope:

- Vulnerabilities in Proxmox VE itself (report to [Proxmox](https://www.proxmox.com/en/about/security))
- Denial-of-service attacks against self-hosted instances
- Issues requiring physical access to the host

## Security Design

PVEmanager applies the following security measures:

- **Encrypted credentials** — Proxmox API tokens and sensitive settings are Fernet-encrypted at rest in PostgreSQL.
- **Bcrypt passwords** — user passwords are hashed with bcrypt, never stored in plaintext.
- **JWT sessions** — short-lived tokens with server-side revocation support.
- **2FA** — optional TOTP-based two-factor authentication per user.
- **RBAC** — granular role-based access control enforced on both server and client side.
- **Unprivileged LXC** — App Store containers run unprivileged by design.
- **Injection-safe exec** — `pct exec` / `pct push` calls are parameterized to prevent shell injection.

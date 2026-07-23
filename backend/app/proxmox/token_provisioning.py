"""Automatic API token provisioning for newly connected Proxmox servers.

The panel prefers token auth over storing a root password: a token can be
revoked from the PVE UI, cannot be used for SSH or web login, and shows up in
the PVE audit log under its own name. This module connects once with the
supplied password, creates a dedicated token, and hands its credentials back to
the caller — see ``api/proxmox/servers.py`` for the create/migrate endpoints.
"""

from typing import Optional, Tuple

from loguru import logger

from .client import ProxmoxClient

# Token id created on the Proxmox side. Kept stable so a returning user
# recognises it in Datacenter → Permissions → API Tokens.
DEFAULT_TOKEN_NAME = "pvemanager"

# PVE rejects token ids outside [A-Za-z0-9.\-_], so suffixes stay numeric.
MAX_NAME_ATTEMPTS = 50


class TokenProvisionError(Exception):
    """Raised when the panel could not create an API token on the server."""


def build_host(ip_address: str, port: Optional[int]) -> str:
    """Host string for ProxmoxClient — appends a non-default port."""
    host = ip_address or ""
    if port and port != 8006:
        return f"{host}:{port}"
    return host


def pick_token_name(existing: set, base: str = DEFAULT_TOKEN_NAME) -> str:
    """Pick a free token id, suffixing when the preferred name is taken.

    Reusing an existing token is not an option: PVE returns the secret only at
    creation time, so an already-present ``pvemanager`` token likely belongs to
    another panel instance and must be left alone.
    """
    if base not in existing:
        return base
    for i in range(2, MAX_NAME_ATTEMPTS + 1):
        candidate = f"{base}-{i}"
        if candidate not in existing:
            return candidate
    raise TokenProvisionError(
        f"Could not find a free API token name after {MAX_NAME_ATTEMPTS} attempts"
    )


def provision_api_token(
    ip_address: str,
    port: Optional[int],
    api_user: str,
    password: str,
    verify_ssl: bool = False,
    comment: str = "Created automatically by PVEmanager",
    privsep: bool = False,
    timeout: int = 15,
) -> Tuple[str, str]:
    """Create an API token on the Proxmox server using password auth.

    Returns ``(token_name, token_value)``. The secret is returned by PVE exactly
    once, so the caller must persist it or the token becomes unusable.

    Raises TokenProvisionError when the server is unreachable, the credentials
    are wrong, or the user lacks permission to create tokens.
    """
    if not password:
        raise TokenProvisionError("A password is required to create an API token")

    client = ProxmoxClient(
        host=build_host(ip_address, port),
        user=api_user,
        password=password,
        verify_ssl=verify_ssl,
        timeout=timeout,
    )
    if not client.is_connected():
        raise TokenProvisionError(
            "Could not authenticate to the Proxmox server with the supplied password"
        )

    existing = {t.get("tokenid") for t in client.get_user_tokens(api_user)}
    token_name = pick_token_name(existing)

    # privsep=0 grants the token the same privileges as the user itself; with
    # privsep=1 it would start with no permissions until ACLs are assigned.
    result = client.create_user_token(api_user, token_name, comment=comment, privsep=privsep)
    if not result.get("success") or not result.get("value"):
        raise TokenProvisionError(
            result.get("error") or "Proxmox did not return a token secret"
        )

    logger.info(f"Created Proxmox API token '{api_user}!{token_name}' on {ip_address}")
    return token_name, result["value"]


def revoke_api_token(
    ip_address: str,
    port: Optional[int],
    api_user: str,
    password: str,
    token_name: str,
    verify_ssl: bool = False,
    timeout: int = 15,
) -> bool:
    """Best-effort cleanup of a token the panel created but failed to persist.

    Without this, a failed server registration leaves an orphaned token on the
    node that nobody can use (its secret was never stored).
    """
    try:
        client = ProxmoxClient(
            host=build_host(ip_address, port),
            user=api_user,
            password=password,
            verify_ssl=verify_ssl,
            timeout=timeout,
        )
        if not client.is_connected():
            return False
        result = client.delete_user_token(api_user, token_name)
        return bool(result.get("success"))
    except Exception as e:
        logger.warning(f"Failed to revoke orphaned token '{token_name}' on {ip_address}: {e}")
        return False

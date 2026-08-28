from typing import Any, Optional

import httpx


class CoolifyAPIError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class CoolifyClient:
    def __init__(self, base_url: str, api_token: str, verify_ssl: bool = True):
        self.base_url = f"{base_url.rstrip('/')}/api/v1"
        self.api_token = api_token
        self.verify_ssl = verify_ssl

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> Any:
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                headers={"Authorization": f"Bearer {self.api_token}", "Accept": "application/json"},
                verify=self.verify_ssl,
                timeout=httpx.Timeout(20.0, connect=10.0),
            ) as client:
                response = await client.request(method, path, json=json, params=params)
        except httpx.RequestError as exc:
            raise CoolifyAPIError("Unable to connect to Coolify") from exc

        if response.is_error:
            message = f"Coolify returned HTTP {response.status_code}"
            try:
                payload = response.json()
                message = payload.get("message") or payload.get("error") or message
            except (ValueError, AttributeError):
                pass
            raise CoolifyAPIError(str(message), 502)

        if response.status_code == 204 or not response.content:
            return None
        try:
            return response.json()
        except ValueError as exc:
            raise CoolifyAPIError("Coolify returned an invalid response") from exc

    async def servers(self) -> list[dict]:
        result = await self.request("GET", "/servers")
        return result if isinstance(result, list) else []

    async def resources(self, server_uuid: str) -> list[dict]:
        result = await self.request("GET", f"/servers/{server_uuid}/resources")
        return result if isinstance(result, list) else []

    async def action(self, resource_type: str, resource_uuid: str, action: str) -> Any:
        plural = "applications" if resource_type == "application" else "services"
        if action == "deploy":
            return await self.request("GET", "/deploy", params={"uuid": resource_uuid})
        return await self.request("GET", f"/{plural}/{resource_uuid}/{action}")

    async def logs(self, resource_type: str, resource_uuid: str, lines: int) -> Any:
        plural = "applications" if resource_type == "application" else "services"
        return await self.request("GET", f"/{plural}/{resource_uuid}/logs", params={"lines": lines})

from typing import List, Dict, Optional
from loguru import logger


class AccessMixin:
    """
    PVE Access: realms (домены аутентификации, /access/domains) и
    API-токены пользователей (/access/users/{userid}/token).
    Геттеры возвращают данные как есть, мутации — {"success": bool, ...}.
    """

    # ---------- Realms (auth domains) ----------

    def get_realms(self) -> List[Dict]:
        """Список realms: [{realm, type, comment, tfa?}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.access.domains.get() or [])
        except Exception as e:
            logger.error(f"Error getting realms: {e}")
            return []

    def create_realm(self, realm: str, realm_type: str, **kwargs) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.access.domains.post(realm=realm, type=realm_type, **kwargs)
            return {"success": True, "realm": realm}
        except Exception as e:
            logger.error(f"Error creating realm {realm}: {e}")
            return {"success": False, "error": str(e)}

    def update_realm(self, realm: str, **kwargs) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.access.domains(realm).put(**kwargs)
            return {"success": True}
        except Exception as e:
            logger.error(f"Error updating realm {realm}: {e}")
            return {"success": False, "error": str(e)}

    def delete_realm(self, realm: str) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.access.domains(realm).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting realm {realm}: {e}")
            return {"success": False, "error": str(e)}

    # ---------- Users & API tokens ----------

    def get_access_users(self) -> List[Dict]:
        """Список пользователей PVE: [{userid, enable, comment, ...}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.access.users.get() or [])
        except Exception as e:
            logger.error(f"Error getting access users: {e}")
            return []

    def get_user_tokens(self, userid: str) -> List[Dict]:
        """Токены пользователя: [{tokenid, comment, expire, privsep}]."""
        if not self.proxmox:
            return []
        try:
            return list(self.proxmox.access.users(userid).token.get() or [])
        except Exception as e:
            logger.error(f"Error getting tokens for {userid}: {e}")
            return []

    def create_user_token(self, userid: str, tokenid: str,
                          comment: Optional[str] = None, privsep: bool = True,
                          expire: Optional[int] = None) -> Dict:
        """
        Создать API-токен. Возвращает секрет (value) — показывается один раз.
        """
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            params: Dict = {"privsep": 1 if privsep else 0}
            if comment:
                params["comment"] = comment
            if expire:
                params["expire"] = expire
            result = self.proxmox.access.users(userid).token(tokenid).post(**params)
            data = dict(result or {})
            return {
                "success": True,
                "value": data.get("value"),
                "full_tokenid": data.get("full-tokenid") or f"{userid}!{tokenid}",
                "info": data.get("info"),
            }
        except Exception as e:
            logger.error(f"Error creating token {tokenid} for {userid}: {e}")
            return {"success": False, "error": str(e)}

    def delete_user_token(self, userid: str, tokenid: str) -> Dict:
        if not self.proxmox:
            return {"success": False, "error": "Not connected"}
        try:
            self.proxmox.access.users(userid).token(tokenid).delete()
            return {"success": True}
        except Exception as e:
            logger.error(f"Error deleting token {tokenid} for {userid}: {e}")
            return {"success": False, "error": str(e)}

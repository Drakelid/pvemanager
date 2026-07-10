"""
Запуск скриптов и журнал выполнений.

  POST /api/scripts/{id}/execute        — запустить скрипт
  GET  /api/scripts/executions          — история запусков текущего пользователя (админ — все)
  GET  /api/scripts/executions/{id}     — детали запуска (вывод, exit code)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...auth import PermissionChecker
from ...db import get_db
from ...models import ProxmoxServer, ScriptCatalog, ScriptExecution, User
from ...services import script_engine
from ...config import utcnow

router = APIRouter()

_MAX_OUTPUT = 200_000  # см. SCRIPT_EXECUTION_OUTPUT_LIMIT в models/scripts.py


class ExecuteRequest(BaseModel):
    server_id: int
    node: Optional[str] = None
    vmid: Optional[int] = None
    vm_type: Optional[str] = Field(default=None, pattern="^(qemu|lxc)$")
    params: dict = {}
    timeout: int = Field(default=60, ge=1, le=600)


def _can_admin(user: User) -> bool:
    return bool(getattr(user, "is_admin", False)) or user.has_permission("script:manage")


@router.post("/api/scripts/{script_id}/execute")
def execute_script(
    script_id: int,
    req: ExecuteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("script:execute")),
):
    script = db.get(ScriptCatalog, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Скрипт не найден")

    server = db.get(ProxmoxServer, req.server_id)
    if not server:
        raise HTTPException(status_code=404, detail="Сервер не найден")

    if script.target_type == "guest" and (req.vmid is None or not req.node or not req.vm_type):
        raise HTTPException(status_code=400, detail="Для guest-скрипта нужны node, vmid и vm_type")

    # Валидация обязательных параметров по схеме скрипта.
    schema = script.params_schema or []
    params = dict(req.params or {})
    for field in schema:
        name = field.get("name")
        if not name:
            continue
        if name not in params or params[name] in (None, ""):
            if field.get("required"):
                raise HTTPException(status_code=400, detail=f"Параметр '{name}' обязателен")
            if field.get("default") is not None:
                params[name] = field["default"]
    params = {k: str(v) for k, v in params.items() if k in {f.get("name") for f in schema}}

    execution = ScriptExecution(
        script_id=script.id, script_name=script.name,
        target_type=script.target_type, server_id=server.id,
        node=req.node, vmid=req.vmid, params_used=params,
        status="running", user_id=current_user.id,
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    rendered = script_engine.render_params(script.content, params)
    result = script_engine.execute(
        server, target_type=script.target_type, node=req.node, vmid=req.vmid,
        vm_type=req.vm_type, script=rendered, interpreter=script.interpreter,
        timeout=req.timeout,
    )

    execution.status = "success" if result.success else "failed"
    execution.exit_code = result.exit_code
    execution.output = (result.output or "")[:_MAX_OUTPUT]
    execution.error_text = result.error
    execution.finished_at = utcnow()
    db.commit()
    db.refresh(execution)

    return execution.to_dict()


@router.get("/api/scripts/executions")
def list_executions(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("script:view")),
):
    q = db.query(ScriptExecution)
    if not _can_admin(current_user):
        q = q.filter(ScriptExecution.user_id == current_user.id)
    items = q.order_by(ScriptExecution.started_at.desc()).limit(min(limit, 200)).all()
    return {"items": [e.to_dict() for e in items]}


@router.get("/api/scripts/executions/{execution_id}")
def get_execution(
    execution_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(PermissionChecker("script:view")),
):
    execution = db.get(ScriptExecution, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Запуск не найден")
    if not _can_admin(current_user) and execution.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому запуску")
    return execution.to_dict()

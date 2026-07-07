"""
App Store — модуль каталога self-hosted приложений (1 приложение = 1 LXC + Docker Compose).

M0 (Proof of Concept): изолированный backend-каркас install-пайплайна
`clone → push → exec → health-check` для одного приложения. НЕ подключается к
FastAPI (роутеры не регистрируются) — запускается вручную через CLI
(`python -m app.appstore.cli ...`) для ручной проверки схемы на реальном Proxmox.

См. docs/appstore-poc.md.
"""

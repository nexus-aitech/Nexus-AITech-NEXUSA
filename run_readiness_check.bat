@echo off
cd /d D:\NEXUSA
call .\.venv\Scripts\activate
python launch_readiness_check.py --install-missing --strict --report readiness_report.md
echo Done. Report -> readiness_report.md
pause

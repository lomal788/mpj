@echo off
chcp 65001 >nul
python "%~dp0tools\ghidra_mcp_server.py" %*
if errorlevel 1 pause

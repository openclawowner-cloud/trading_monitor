@echo off
set "TELEMETRY_ROOT=%~1"
set "AGENT_OUT_DIR=%~2"
set "PYTHON=%~3"
set "SCRIPT=%~4"
REM Force venv site-packages first (%~dp3 = dir of python.exe, .. = venv root)
set "PYTHONPATH=%~dp3..\Lib\site-packages"
"%PYTHON%" "%SCRIPT%"

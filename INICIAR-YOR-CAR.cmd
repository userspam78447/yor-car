@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 ou superior para iniciar a Your Car.
  pause
  exit /b 1
)
echo Your Car - Sistema local
echo Abra http://localhost:3333 no navegador.
echo Primeiro acesso: http://localhost:3333/setup
echo Mantenha esta janela aberta enquanto usar o sistema.
node server/index.mjs
pause

@echo off
chcp 65001 > nul
echo.
echo ===================================
echo  병원 블로그 자동화 - EXE 빌드
echo ===================================
echo.

echo [1/2] Next.js 빌드 중...
call npm run build
if %errorlevel% neq 0 (
  echo 빌드 실패!
  pause
  exit /b 1
)

echo.
echo [2/2] Electron 패키지 빌드 중...
call npx electron-builder --win --x64
if %errorlevel% neq 0 (
  echo Electron 빌드 실패!
  pause
  exit /b 1
)

echo.
echo ===================================
echo  완료! dist-electron 폴더 확인
echo ===================================
echo.
start "" "dist-electron"
pause

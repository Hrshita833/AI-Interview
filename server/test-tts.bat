@echo off
REM ─────────────────────────────────────────────────────────────
REM test-tts.bat – Quick smoke test for the TTS endpoint (Windows)
REM
REM Usage:
REM   1. Start your server:  cd server && npm run dev
REM   2. Log in through the browser so you have an auth cookie
REM   3. Copy the JWT cookie value and run:
REM
REM      test-tts.bat YOUR_JWT_TOKEN_HERE
REM
REM ─────────────────────────────────────────────────────────────

set BASE_URL=http://localhost:3000
set TOKEN=%1

if "%TOKEN%"=="" (
    echo Please provide your JWT token as the first argument.
    echo Usage: test-tts.bat YOUR_JWT_TOKEN_HERE
    exit /b 1
)

echo ========================================
echo   TTS Endpoint Test
echo ========================================
echo.

echo --- Test 1: Female voice (Priya / Kore) ---
curl -s -o test-female.wav -w "HTTP %%{http_code} | Size: %%{size_download} bytes\n" -X POST "%BASE_URL%/api/mock-interview/tts" -H "Content-Type: application/json" -b "token=%TOKEN%" -d "{\"text\": \"So tell me, what got you interested in this role?\", \"gender\": \"female\"}"
echo.

echo --- Test 2: Male voice (Rahul / Puck) ---
curl -s -o test-male.wav -w "HTTP %%{http_code} | Size: %%{size_download} bytes\n" -X POST "%BASE_URL%/api/mock-interview/tts" -H "Content-Type: application/json" -b "token=%TOKEN%" -d "{\"text\": \"Alright, can you walk me through one project you are proud of?\", \"gender\": \"male\"}"
echo.

echo --- Test 3: Validation - missing gender ---
curl -s -X POST "%BASE_URL%/api/mock-interview/tts" -H "Content-Type: application/json" -b "token=%TOKEN%" -d "{\"text\": \"Hello\"}"
echo.

echo --- Test 4: Auth - no cookie ---
curl -s -X POST "%BASE_URL%/api/mock-interview/tts" -H "Content-Type: application/json" -d "{\"text\": \"Hello\", \"gender\": \"female\"}"
echo.

echo ========================================
echo   Done! Play the WAV files to verify:
echo   start test-female.wav
echo   start test-male.wav
echo ========================================

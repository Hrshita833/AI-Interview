#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# test-tts.sh – Quick smoke test for the TTS endpoint
#
# Usage:
#   1. Start your server:  cd server && npm run dev
#   2. Log in through the browser so you have an auth cookie
#   3. Copy the cookie value and run:
#
#      bash test-tts.sh <YOUR_JWT_COOKIE>
#
#   Or use the curl commands below directly.
# ─────────────────────────────────────────────────────────────

BASE_URL="http://localhost:3000"
TOKEN="${1:-YOUR_JWT_TOKEN_HERE}"

echo "========================================"
echo "  TTS Endpoint Test (POST /api/mock-interview/tts)"
echo "========================================"

echo ""
echo "--- Test 1: Female voice (Priya / Kore) ---"
curl -s -o test-female.wav -w "HTTP %{http_code} | Size: %{size_download} bytes\n" \
  -X POST "$BASE_URL/api/mock-interview/tts" \
  -H "Content-Type: application/json" \
  -b "token=$TOKEN" \
  -d '{"text": "So tell me, what got you interested in this role? I would love to hear your story.", "gender": "female"}'

echo ""
echo "--- Test 2: Male voice (Rahul / Puck) ---"
curl -s -o test-male.wav -w "HTTP %{http_code} | Size: %{size_download} bytes\n" \
  -X POST "$BASE_URL/api/mock-interview/tts" \
  -H "Content-Type: application/json" \
  -b "token=$TOKEN" \
  -d '{"text": "Alright, that sounds interesting. Can you walk me through one project you are most proud of?", "gender": "male"}'

echo ""
echo "--- Test 3: Validation — missing gender ---"
curl -s -w "HTTP %{http_code}\n" \
  -X POST "$BASE_URL/api/mock-interview/tts" \
  -H "Content-Type: application/json" \
  -b "token=$TOKEN" \
  -d '{"text": "Hello"}'

echo ""
echo "--- Test 4: Validation — text too long (>500 chars) ---"
LONG_TEXT=$(python3 -c "print('A' * 501)" 2>/dev/null || python -c "print('A' * 501)")
curl -s -w "HTTP %{http_code}\n" \
  -X POST "$BASE_URL/api/mock-interview/tts" \
  -H "Content-Type: application/json" \
  -b "token=$TOKEN" \
  -d "{\"text\": \"$LONG_TEXT\", \"gender\": \"female\"}"

echo ""
echo "--- Test 5: Auth — no cookie ---"
curl -s -w "HTTP %{http_code}\n" \
  -X POST "$BASE_URL/api/mock-interview/tts" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello", "gender": "female"}'

echo ""
echo "========================================"
echo "  Results"
echo "========================================"
echo ""
echo "If tests 1-2 returned HTTP 200 and non-zero sizes:"
echo "  → Play test-female.wav and test-male.wav to verify audio."
echo "  → On macOS:  afplay test-female.wav"
echo "  → On Linux:  aplay test-female.wav"
echo "  → On Windows: start test-female.wav"
echo ""
echo "Test 3 should return HTTP 400 (missing gender)."
echo "Test 4 should return HTTP 400 (text too long)."
echo "Test 5 should return HTTP 401 (not authenticated)."
echo ""

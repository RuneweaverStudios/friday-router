#!/bin/bash
# Friday Router v2 - Quick Test

echo "=== Friday Router v2.0 Test ==="
echo ""

# Check for API keys
if [ -n "$ZAI_API_KEY" ]; then
  echo "✅ Provider: ZAI (Zhipu AI)"
elif [ -n "$GOOGLE_API_KEY" ]; then
  echo "✅ Provider: Google AI"
elif [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "✅ Provider: Anthropic"
elif [ -n "$OPENROUTER_API_KEY" ]; then
  echo "✅ Provider: OpenRouter"
else
  echo "❌ No API key found!"
  echo ""
  echo "Set one of:"
  echo "  export ZAI_API_KEY='...'"
  echo "  export GOOGLE_API_KEY='...'"
  echo "  export ANTHROPIC_API_KEY='...'"
  echo "  export OPENROUTER_API_KEY='...'"
  exit 1
fi

echo ""
echo "--- Test 1: Simple task (should use fast model) ---"
node scripts/route.mjs "What is 2+2?" 2>&1 | head -10

echo ""
echo ""
echo "--- Test 2: Medium task ---"
node scripts/route.mjs "Explain what React hooks are" 2>&1 | head -15

echo ""
echo ""
echo "=== Test Complete ==="

#!/bin/bash
export OPENROUTER_API_KEY='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'

echo "=== Friday Router Batch Test ==="
echo "Testing mercury-2 triage across task types"
echo ""

# Simple tasks
echo "--- SIMPLE TASKS ---"
echo "1. What is 2+2?"
node scripts/route.mjs "What is 2+2?" 2>&1 | grep -E "Triage|complexity"
echo ""

echo "2. Define API"
node scripts/route.mjs "Define what an API is" 2>&1 | grep -E "Triage|complexity"
echo ""

echo "3. List primary colors"
node scripts/route.mjs "List the primary colors" 2>&1 | grep -E "Triage|complexity"
echo ""

# Medium tasks
echo "--- MEDIUM TASKS ---"
echo "4. Explain React hooks"
node scripts/route.mjs "Explain how React hooks work" 2>&1 | grep -E "Triage|complexity"
echo ""

echo "5. Compare REST vs GraphQL"
node scripts/route.mjs "Compare REST and GraphQL APIs" 2>&1 | grep -E "Triage|complexity"
echo ""

echo "6. Summarize microservices"
node scripts/route.mjs "Summarize the benefits of microservices" 2>&1 | grep -E "Triage|complexity"
echo ""

# Complex tasks
echo "--- COMPLEX TASKS ---"
echo "7. Build authentication system"
node scripts/route.mjs "Design a complete authentication system with JWT" 2>&1 | grep -E "Triage|complexity"
echo ""

echo "8. Create e-commerce architecture"
node scripts/route.mjs "Create an architecture for a scalable e-commerce platform" 2>&1 | grep -E "Triage|complexity"
echo ""

echo "9. Implement distributed cache"
node scripts/route.mjs "Implement a distributed caching system with Redis" 2>&1 | grep -E "Triage|complexity"
echo ""

echo "=== Test Complete ==="

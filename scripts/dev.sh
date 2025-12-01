#!/bin/bash

# GraphQL Testing Toolkit - Development Helper Script

echo "🚀 GraphQL Testing Toolkit - Development Mode"
echo "============================================="

# Check if Firefox is installed
if command -v firefox &> /dev/null; then
    echo "✅ Firefox found"
else
    echo "❌ Firefox not found. Please install Firefox to test the extension."
    exit 1
fi

# Check if web-ext is installed
if command -v web-ext &> /dev/null; then
    echo "✅ web-ext found"
    echo "🔧 Starting development server..."
    web-ext run --firefox-profile=dev --keep-profile-changes --start-url="about:debugging"
else
    echo "⚠️  web-ext not found. Install with: npm install -g web-ext"
    echo "📖 Manual setup:"
    echo "   1. Open Firefox"
    echo "   2. Go to about:debugging"
    echo "   3. Click 'This Firefox'"
    echo "   4. Click 'Load Temporary Add-on'"
    echo "   5. Select manifest.json from this directory"
    echo ""
    echo "💡 Extension directory: $(pwd)"
fi


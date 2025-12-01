#!/bin/bash

# GraphQL Testing Toolkit - Firefox Publishing Script

echo "🦊 GraphQL Testing Toolkit - Firefox Publishing"
echo "=============================================="

# Check if we're in the right directory
if [ ! -f "manifest.json" ]; then
    echo "❌ manifest.json not found. Please run this script from the project root."
    exit 1
fi

# Build the extension first
echo "🔧 Building extension..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the errors and try again."
    exit 1
fi

# Check if web-ext is installed
if ! command -v web-ext &> /dev/null; then
    echo "❌ web-ext not found. Installing..."
    npm install -g web-ext
fi

# Check for required environment variables
if [ -z "$WEB_EXT_API_KEY" ] || [ -z "$WEB_EXT_API_SECRET" ]; then
    echo "⚠️  Firefox Add-ons API credentials not found."
    echo "📖 To publish automatically, set these environment variables:"
    echo "   export WEB_EXT_API_KEY='your-api-key'"
    echo "   export WEB_EXT_API_SECRET='your-api-secret'"
    echo ""
    echo "🔗 Get your credentials from: https://addons.mozilla.org/developers/addon/api/key/"
    echo ""
    echo "📦 Manual publishing:"
    echo "   1. Go to https://addons.mozilla.org/developers/"
    echo "   2. Upload: dist/graphql-testing-toolkit-firefox.zip"
    exit 1
fi

echo "🚀 Publishing to Firefox Add-ons..."

# Sign and publish the extension
web-ext sign \
    --source-dir=dist/firefox \
    --artifacts-dir=web-ext-artifacts \
    --api-key="$WEB_EXT_API_KEY" \
    --api-secret="$WEB_EXT_API_SECRET"

if [ $? -eq 0 ]; then
    echo "✅ Firefox extension published successfully!"
    echo "📁 Signed extension available in: web-ext-artifacts/"
else
    echo "❌ Publishing failed. Check the error messages above."
    echo "📦 Manual upload: dist/graphql-testing-toolkit-firefox.zip"
    exit 1
fi

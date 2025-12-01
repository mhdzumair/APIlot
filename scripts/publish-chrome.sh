#!/bin/bash

# GraphQL Testing Toolkit - Chrome Web Store Publishing Script

echo "🌐 GraphQL Testing Toolkit - Chrome Web Store Publishing"
echo "======================================================"

# Check if we're in the right directory
if [ ! -f "manifest-v3.json" ]; then
    echo "❌ manifest-v3.json not found. Please run this script from the project root."
    exit 1
fi

# Build the extension first
echo "🔧 Building extension..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the errors and try again."
    exit 1
fi

# Check for required environment variables
if [ -z "$CHROME_CLIENT_ID" ] || [ -z "$CHROME_CLIENT_SECRET" ] || [ -z "$CHROME_REFRESH_TOKEN" ] || [ -z "$CHROME_EXTENSION_ID" ]; then
    echo "⚠️  Chrome Web Store API credentials not found."
    echo "📖 To publish automatically, set these environment variables:"
    echo "   export CHROME_CLIENT_ID='your-client-id'"
    echo "   export CHROME_CLIENT_SECRET='your-client-secret'"
    echo "   export CHROME_REFRESH_TOKEN='your-refresh-token'"
    echo "   export CHROME_EXTENSION_ID='your-extension-id'"
    echo ""
    echo "🔗 Setup guide: https://developer.chrome.com/docs/webstore/using_webstore_api/"
    echo ""
    echo "📦 Manual publishing:"
    echo "   1. Go to https://chrome.google.com/webstore/devconsole"
    echo "   2. Upload: dist/graphql-testing-toolkit-chrome.zip"
    echo "   3. Fill in the store listing details"
    echo "   4. Submit for review"
    echo ""
    echo "💡 Chrome package ready at: dist/graphql-testing-toolkit-chrome.zip"
    exit 1
fi

# Check if chrome-webstore-upload-cli is available
if ! command -v chrome-webstore-upload &> /dev/null; then
    echo "📦 Installing chrome-webstore-upload-cli..."
    npm install -g chrome-webstore-upload-cli
fi

echo "🚀 Publishing to Chrome Web Store..."

# Upload to Chrome Web Store
chrome-webstore-upload upload \
    --source dist/graphql-testing-toolkit-chrome.zip \
    --extension-id "$CHROME_EXTENSION_ID" \
    --client-id "$CHROME_CLIENT_ID" \
    --client-secret "$CHROME_CLIENT_SECRET" \
    --refresh-token "$CHROME_REFRESH_TOKEN"

if [ $? -eq 0 ]; then
    echo "✅ Chrome extension uploaded successfully!"
    echo "📝 Note: The extension is uploaded but not published yet."
    echo "🔗 Go to Chrome Web Store Developer Console to publish: https://chrome.google.com/webstore/devconsole"

    # Optionally publish immediately (uncomment if desired)
    # echo "🚀 Publishing immediately..."
    # chrome-webstore-upload publish \
    #     --extension-id "$CHROME_EXTENSION_ID" \
    #     --client-id "$CHROME_CLIENT_ID" \
    #     --client-secret "$CHROME_CLIENT_SECRET" \
    #     --refresh-token "$CHROME_REFRESH_TOKEN"
else
    echo "❌ Upload failed. Check the error messages above."
    echo "📦 Manual upload: dist/graphql-testing-toolkit-chrome.zip"
    exit 1
fi

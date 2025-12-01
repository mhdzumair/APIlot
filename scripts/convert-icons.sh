#!/bin/bash

# Script to convert logo images to browser extension icon sizes
# Requires ImageMagick (install with: brew install imagemagick)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo -e "${RED}Error: ImageMagick is not installed.${NC}"
    echo -e "${YELLOW}Install it with: brew install imagemagick${NC}"
    exit 1
fi

# Define source images
MAIN_LOGO="artifacts/logo.png"
ENABLE_LOGO="artifacts/enable-logo.png"
DISABLE_ICON="artifacts/disable-logo.png"

# Define icon sizes
SIZES=(16 32 48 128)

# Create assets/icons directory if it doesn't exist
mkdir -p assets/icons

echo -e "${GREEN}Converting images to browser extension icon sizes...${NC}"

# Function to convert an image to multiple sizes
convert_image() {
    local source_file="$1"
    local prefix="$2"
    local suffix="$3"
    
    if [ ! -f "$source_file" ]; then
        echo -e "${RED}Error: Source file '$source_file' not found${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}Converting $source_file...${NC}"
    
    for size in "${SIZES[@]}"; do
        output_file="assets/icons/${prefix}-${size}${suffix}.png"
        echo "  Creating ${size}x${size} -> $output_file"
        
        # Convert with high quality settings
        convert "$source_file" \
            -resize "${size}x${size}" \
            -background transparent \
            -gravity center \
            -extent "${size}x${size}" \
            -quality 100 \
            "$output_file"
    done
}

# Convert main logo to standard icons
convert_image "$MAIN_LOGO" "icon" ""

# Convert enable logo to enabled state icons
convert_image "$ENABLE_LOGO" "icon" "-enabled"

# Convert disable icon to disabled state icons  
convert_image "$DISABLE_ICON" "icon" "-disabled"

echo -e "${GREEN}✓ Icon conversion completed!${NC}"
echo ""
echo -e "${YELLOW}Generated icons:${NC}"
echo "Standard icons (main logo):"
for size in "${SIZES[@]}"; do
    echo "  - assets/icons/icon-${size}.png (${size}x${size})"
done

echo ""
echo "Enabled state icons:"
for size in "${SIZES[@]}"; do
    echo "  - assets/icons/icon-${size}-enabled.png (${size}x${size})"
done

echo ""
echo "Disabled state icons:"
for size in "${SIZES[@]}"; do
    echo "  - assets/icons/icon-${size}-disabled.png (${size}x${size})"
done

echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "1. Review the generated icons in assets/icons/"
echo "2. Update your extension code to use different icons for enabled/disabled states"
echo "3. Test the icons in your browser extension"

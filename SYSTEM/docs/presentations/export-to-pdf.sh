#!/bin/bash

# Export ClawMax presentation to PDF
# Usage: ./export-to-pdf.sh

echo "🚀 ClawMax Presentation PDF Export"
echo "===================================="
echo ""

PRESENTATION_FILE="clawmax-v1-launch.html"
OUTPUT_PDF="clawmax-v1-launch.pdf"

# Check if presentation file exists
if [ ! -f "$PRESENTATION_FILE" ]; then
    echo "❌ Error: $PRESENTATION_FILE not found"
    echo "   Make sure you're in the presentations directory"
    exit 1
fi

echo "📄 Found: $PRESENTATION_FILE"
echo ""

# Method 1: Check if decktape is installed
if command -v decktape &> /dev/null; then
    echo "✅ Decktape found - using high-quality PDF export"
    echo "⏳ Generating PDF..."
    decktape reveal "$PRESENTATION_FILE" "$OUTPUT_PDF" --size 1280x720

    if [ -f "$OUTPUT_PDF" ]; then
        echo "✅ PDF created: $OUTPUT_PDF"
        echo ""
        echo "📊 File size: $(du -h "$OUTPUT_PDF" | cut -f1)"
        echo "📂 Location: $(pwd)/$OUTPUT_PDF"
    else
        echo "❌ PDF generation failed"
        exit 1
    fi
else
    echo "⚠️  Decktape not installed"
    echo ""
    echo "You have two options:"
    echo ""
    echo "Option 1: Install decktape for best quality"
    echo "  npm install -g decktape"
    echo "  Then run this script again"
    echo ""
    echo "Option 2: Manual export via browser"
    echo "  1. Open: file://$(pwd)/$PRESENTATION_FILE?print-pdf"
    echo "  2. Print (Cmd+P or Ctrl+P)"
    echo "  3. Save as PDF"
    echo "  4. Settings:"
    echo "     - Layout: Landscape"
    echo "     - Margins: None"
    echo "     - Background graphics: Enabled"
    echo ""
    echo "Opening browser for manual export..."
    sleep 2

    # Try to open in default browser
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "$PRESENTATION_FILE?print-pdf"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open "$PRESENTATION_FILE?print-pdf"
    else
        echo "Please open: $PRESENTATION_FILE?print-pdf in your browser"
    fi
fi

echo ""
echo "🎯 Next steps:"
echo "   - Review the PDF"
echo "   - Share with attendees"
echo "   - Practice your demo!"
echo ""

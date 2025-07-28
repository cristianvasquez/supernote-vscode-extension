#!/bin/bash

set -e

echo "Installing Supernote file handlers..."

# Create directories if they don't exist
mkdir -p ~/.local/share/applications
mkdir -p ~/config/bin

# Copy files
cp supernote-viewer.desktop ~/.local/share/applications/
cp supernote-protocol.desktop ~/.local/share/applications/
cp supernote-opener ~/config/bin/
chmod +x ~/config/bin/supernote-opener

# Create MIME type for .note files
mkdir -p ~/.local/share/mime/packages
cat > ~/.local/share/mime/packages/supernote.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
    <mime-type type="application/x-supernote">
        <comment>Supernote file</comment>
        <glob pattern="*.note"/>
    </mime-type>
</mime-info>
EOF

# Update MIME database
update-mime-database ~/.local/share/mime

# Update desktop database
update-desktop-database ~/.local/share/applications

# Register protocol handler
xdg-mime default supernote-protocol.desktop x-scheme-handler/supernote

# Set default application for .note files
xdg-mime default supernote-viewer.desktop application/x-supernote

echo "✅ Installation complete!"
echo ""
echo "Usage:"
echo "1. Double-click .note files to open in VS Code"
echo "2. Use markdown links like: [Page 3](supernote:///path/to/file.note?page=3)"
echo "3. Or relative links: [Page 3](supernote://file.note?page=3)"
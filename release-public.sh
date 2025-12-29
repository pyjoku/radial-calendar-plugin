#!/bin/bash
# Public Release Script - pushes ONLY CODE to PUBLIC repo
# Excludes: specs/, skills/, CLAUDE.md, .archive/, .claude/
# Usage: ./scripts/release-public.sh [patch|minor|major] "Description"

set -e

TYPE=${1:-patch}
DESC=${2:-"Release"}
TEMP_DIR="/tmp/radial-calendar-public-$$"
PUBLIC_REPO="https://github.com/pyjoku/radial-calendar-plugin.git"

# Get current version from package.json
CURRENT=$(node -p "require('./package.json').version")
NEW_VERSION="$CURRENT"  # Use current version (already bumped by dev release)

echo "🌐 PUBLIC Release: v$NEW_VERSION"
echo "📋 Description: $DESC"

# Ensure build is current
echo "🔨 Building..."
npm run build

# Create temp directory and clone public repo
echo "📥 Cloning public repo..."
git clone --depth 1 "$PUBLIC_REPO" "$TEMP_DIR"

# Copy only public files (exclude specs, skills, CLAUDE.md, .archive, .claude)
echo "📦 Copying public files..."
cp -r src/ "$TEMP_DIR/"
cp main.js "$TEMP_DIR/"
cp manifest.json "$TEMP_DIR/"
cp package.json "$TEMP_DIR/"
cp styles.css "$TEMP_DIR/"
cp README.md "$TEMP_DIR/"
cp LICENSE "$TEMP_DIR/" 2>/dev/null || true
cp tsconfig.json "$TEMP_DIR/"
cp esbuild.config.mjs "$TEMP_DIR/"
cp .gitignore "$TEMP_DIR/"
cp -r scripts/ "$TEMP_DIR/" 2>/dev/null || true
cp BACKLOG.md "$TEMP_DIR/" 2>/dev/null || true

# Commit and push in temp directory
cd "$TEMP_DIR"
git add -A
git commit -m "release: v$NEW_VERSION - $DESC" || echo "No changes to commit"

echo "🏷️  Tagging..."
git tag -a "v$NEW_VERSION" -m "$DESC" 2>/dev/null || echo "Tag already exists"

echo "🚀 Pushing to PUBLIC repo..."
git push origin main --tags 2>/dev/null || git push origin main

echo "📦 Creating GitHub release..."
gh release create "v$NEW_VERSION" \
  main.js \
  manifest.json \
  styles.css \
  --title "v$NEW_VERSION" \
  --notes "$DESC" 2>/dev/null || echo "Release already exists or created"

# Cleanup
cd -
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Public Release v$NEW_VERSION erstellt!"
echo "🔗 https://github.com/pyjoku/radial-calendar-plugin/releases/tag/v$NEW_VERSION"

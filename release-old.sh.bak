#!/bin/bash
# Release Script for Radial Calendar Plugin
# Usage: ./scripts/release.sh [patch|minor|major] "Description"

set -e

TYPE=${1:-patch}
DESC=${2:-"Release"}

# Get current version
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

# Calculate new version
case $TYPE in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch|*)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "📦 Version: $CURRENT → $NEW_VERSION"

# Update versions
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" package.json
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" manifest.json

# Build
echo "🔨 Building..."
npm run build

# Git operations
echo "📝 Committing..."
git add -A
git commit -m "release: v$NEW_VERSION - $DESC"

echo "🏷️  Tagging..."
git tag -a "v$NEW_VERSION" -m "$DESC"

echo "🚀 Pushing..."
git push origin main --tags

echo "📦 Creating GitHub release..."
gh release create "v$NEW_VERSION" \
  main.js \
  manifest.json \
  styles.css \
  --title "v$NEW_VERSION - $DESC" \
  --notes "$DESC"

echo ""
echo "✅ Release v$NEW_VERSION erstellt!"
echo "🔗 https://github.com/pyjoku/radial-calendar-plugin/releases/tag/v$NEW_VERSION"

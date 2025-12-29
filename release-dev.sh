#!/bin/bash
# Development Release Script - pushes to PRIVATE repo (origin)
# Includes: specs/, skills/, CLAUDE.md, .archive/
# Usage: ./scripts/release-dev.sh [patch|minor|major] "Description"

set -e

TYPE=${1:-patch}
DESC=${2:-"Development"}

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
echo "🔧 DEV Release: $CURRENT → $NEW_VERSION"

# Update versions
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" package.json
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" manifest.json

# Build
echo "🔨 Building..."
npm run build

# Git operations - push to PRIVATE repo (origin)
echo "📝 Committing..."
git add -A
git commit -m "dev: v$NEW_VERSION - $DESC"

echo "🏷️  Tagging..."
git tag -a "v$NEW_VERSION" -m "$DESC"

echo "🚀 Pushing to PRIVATE repo (origin)..."
git push origin main --tags

echo "📦 Creating GitHub release..."
gh release create "v$NEW_VERSION" \
  main.js \
  manifest.json \
  styles.css \
  --repo pyjoku/radial-calendar-dev \
  --title "v$NEW_VERSION - $DESC" \
  --notes "$DESC"

echo ""
echo "✅ Dev Release v$NEW_VERSION erstellt!"
echo "🔗 https://github.com/pyjoku/radial-calendar-dev/releases/tag/v$NEW_VERSION"
echo ""
echo "💡 For PUBLIC release, run: ./scripts/release-public.sh"

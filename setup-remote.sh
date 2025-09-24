#!/bin/bash

# Setup script for publishing python-react-ml to GitHub
# Usage: ./setup-remote.sh YOUR_GITHUB_USERNAME

if [ $# -eq 0 ]; then
    echo "Usage: $0 YOUR_GITHUB_USERNAME"
    echo "Example: $0 johndoe"
    exit 1
fi

USERNAME=$1
REPO_URL="https://github.com/$USERNAME/python-react-ml.git"

echo "🔗 Adding remote origin..."
git remote add origin $REPO_URL

echo "📤 Pushing to GitHub..."
git branch -M main
git push -u origin main

echo "✅ Repository published successfully!"
echo "🌐 Your repository is now available at: https://github.com/$USERNAME/python-react-ml"

echo ""
echo "📦 Next steps for npm publishing:"
echo "1. npm login"
echo "2. npm run publish:all"
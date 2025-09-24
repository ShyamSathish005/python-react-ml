#!/bin/bash

# Update repository URLs in package.json files
# Usage: ./update-repo-urls.sh YOUR_GITHUB_USERNAME YOUR_NAME YOUR_EMAIL

if [ $# -lt 3 ]; then
    echo "Usage: $0 YOUR_GITHUB_USERNAME YOUR_NAME YOUR_EMAIL"
    echo "Example: $0 johndoe 'John Doe' 'john@example.com'"
    exit 1
fi

USERNAME=$1
NAME=$2
EMAIL=$3

echo "🔄 Updating repository URLs..."

# Update root package.json
sed -i '' "s/yourusername/$USERNAME/g" package.json
sed -i '' "s/Your Name/$NAME/g" package.json
sed -i '' "s/your.email@example.com/$EMAIL/g" package.json

echo "✅ Updated package.json with:"
echo "   GitHub username: $USERNAME"
echo "   Author name: $NAME"
echo "   Author email: $EMAIL"

echo ""
echo "📝 Repository URLs updated in package.json"
echo "🔗 Homepage: https://github.com/$USERNAME/python-react-ml#readme"
echo "🐛 Issues: https://github.com/$USERNAME/python-react-ml/issues"
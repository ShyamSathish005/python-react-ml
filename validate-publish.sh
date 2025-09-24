#!/bin/bash

echo "🔍 Validating python-react-ml for publishing..."
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not a git repository"
    exit 1
fi

# Check if there are uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Warning: You have uncommitted changes"
    git status --short
    echo ""
fi

# Check if packages build successfully
echo "🔨 Testing build..."
if npm run build > /dev/null 2>&1; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

# Check if tests pass
echo "🧪 Running tests..."
if npm test > /dev/null 2>&1; then
    echo "✅ All tests pass"
else
    echo "❌ Tests failed"
    exit 1
fi

# Check package.json files exist
echo "📦 Checking packages..."
packages=("packages/core" "packages/react" "packages/react-native" "packages/cli")
for pkg in "${packages[@]}"; do
    if [ -f "$pkg/package.json" ]; then
        echo "✅ $pkg package.json exists"
    else
        echo "❌ $pkg/package.json missing"
        exit 1
    fi
done

# Check examples
echo "💡 Checking examples..."
examples=("examples/react-web" "examples/react-native-app")
for example in "${examples[@]}"; do
    if [ -f "$example/package.json" ]; then
        echo "✅ $example exists"
    else
        echo "❌ $example missing"
        exit 1
    fi
done

# Check essential files
echo "📄 Checking essential files..."
essential_files=("README.md" "LICENSE" "CHANGELOG.md" "CONTRIBUTING.md")
for file in "${essential_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
    fi
done

echo ""
echo "🎉 Validation complete! Repository is ready for publishing."
echo ""
echo "Next steps:"
echo "1. Create GitHub repository at https://github.com"
echo "2. Run: ./update-repo-urls.sh YOUR_USERNAME 'Your Name' 'your@email.com'"
echo "3. Run: ./setup-remote.sh YOUR_USERNAME"
echo "4. Optional: npm login && npm run publish:all"
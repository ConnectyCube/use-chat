CHANGELOG_FILE="CHANGELOG.md"
LATEST_VERSION=$(grep -o '## [0-9]\+\.[0-9]\+\.[0-9]\+' "$CHANGELOG_FILE" | head -n 1 | awk '{print $2}')

jq ".version = \"$LATEST_VERSION\"" package.json > temp.json && mv temp.json package.json
npm install

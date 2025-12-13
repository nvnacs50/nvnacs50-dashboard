#!/bin/bash

# Upload updated questions to Gist
# Usage: ./upload-updated-questions.sh YOUR_GITHUB_TOKEN

if [ -z "$1" ]; then
    echo "Usage: $0 YOUR_GITHUB_TOKEN"
    exit 1
fi

TOKEN="$1"
GIST_ID="***REMOVED***"

echo "📤 Uploading updated questions to Gist..."

# Read XML content and escape for JSON
XML_CONTENT=$(cat public/student/data/cs50-questions.xml | jq -Rs .)

# Update Gist
curl -X PATCH \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/gists/$GIST_ID \
  -d "{
    \"files\": {
      \"cs50-questions.xml\": {
        \"content\": $XML_CONTENT
      }
    }
  }"

echo -e "\n\n✅ Upload complete!"
echo "🔗 Gist URL: https://gist.github.com/m-avramova/$GIST_ID"

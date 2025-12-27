#!/bin/bash
# generate_global_readme.sh
# Automatically generates _global_readme.md from all individual _readme.md files

OUTPUT="_global_readme.md"

# Start with the root readme
cat _readme.md > "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add assets readme
cat assets/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add src readme
cat src/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add buses readme
cat src/buses/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add buses/models readme
cat src/buses/models/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add buses/models/components readme
cat src/buses/models/components/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add city readme
cat src/city/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add city/engines readme
cat src/city/engines/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add city/generators readme
cat src/city/generators/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add city/materials readme
cat src/city/materials/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add city/models readme
cat src/city/models/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add engine readme
cat src/engine/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add environment readme
cat src/environment/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add hud readme
cat src/hud/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add physics readme
cat src/physics/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add states readme
cat src/states/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Add utils readme
cat src/utils/_readme.md >> "$OUTPUT"

echo "" >> "$OUTPUT"

echo "✓ Generated $OUTPUT from all individual _readme.md files"


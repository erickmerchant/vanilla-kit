DIR=$(dirname $0)
mkdir -p vendor/vanilla-kit
cat "$DIR/lib.js" > vendor/vanilla-kit/lib.js

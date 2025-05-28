build-all: (build "borsh") (build "sdk-core") (build "sdk-solana") (build "sdk-sui") (build "sdk-facade")

build pkg:
    npm run build --workspace=@race-foundation/{{pkg}}

check pkg:
    npm run check --workspace=@race-foundation/{{pkg}}

deps:
    npm i -ws

# Publish js PKG to npmjs
publish-npmjs pkg:
    npm --prefix ./js/{{pkg}} run build
    (cd js/{{pkg}}; npm publish --access=public)

# Publish all js pacakges
publish-npmjs-all: (publish-npmjs "borsh") (publish-npmjs "sdk-core") (publish-npmjs "sdk-facade") (publish-npmjs "sdk-solana")

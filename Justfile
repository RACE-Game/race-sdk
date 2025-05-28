borsh:
    npm run build --workspace=@race-foundation/borsh

sdk-core:
    npm run build --workspace=@race-foundation/sdk-core

sdk-facade:
    npm run build --workspace=@race-foundation/sdk-facade

sdk-solana:
    npm run build --workspace=@race-foundation/sdk-solana

sdk-sui:
    npm run build --workspace=@race-foundation/sdk-sui

sdk: sdk-core sdk-facade sdk-solana sdk-sui

deps:
    npm i -ws

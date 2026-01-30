import { INft, IToken, IGameBundle } from './accounts'
import { EncryptorExportedKeys } from './encryptor'
import { PlayerProfileWithPfp } from './types'

const DB_KEY = 'race-protocol'
const DB_VER = 3

const STORE_TOKENS = 'tokens'
const STORE_BUNDLES = 'bundles'
const STORE_NFTS = 'nfts'
const STORE_PROFILES= 'profiles'
const STORE_SECRETS = 'secrets'

type SecretObject = {
    addr: string
    secret: Uint8Array
}

export interface IStorage {
    cacheTokens(tokens: IToken[]): void

    getTokens(tokenAddrs: string[]): Promise<Array<IToken | undefined>>

    cacheBundle(gameBundle: IGameBundle): void

    getBundle(addr: string): Promise<IGameBundle | undefined>

    cacheNft(token: INft): void

    getNft(nftAddr: string): Promise<INft | undefined>

    cacheSecret(playerAddr: string, originSecret: Uint8Array): void

    getSecret(playerAddr: string): Promise<Uint8Array | undefined>

    cacheProfile(profile: PlayerProfileWithPfp): void

    getProfile(profileAddr: string): Promise<PlayerProfileWithPfp | undefined>
}

export class Storage implements IStorage {
    constructor() {
        const request = indexedDB.open(DB_KEY, DB_VER)
        request.onupgradeneeded = (_e: IDBVersionChangeEvent) => {
            const db = request.result

            if (!db.objectStoreNames.contains(STORE_TOKENS)) {
                console.debug(`Storage: creating object store "tokens" in IndexedDB`)
                db.createObjectStore(STORE_TOKENS, { keyPath: 'addr' })
            }

            if (!db.objectStoreNames.contains(STORE_NFTS)) {
                console.debug(`Storage: creating object store "nfts" in IndexedDB`)
                db.createObjectStore(STORE_NFTS, { keyPath: 'addr' })
            }

            if (!db.objectStoreNames.contains(STORE_BUNDLES)) {
                console.debug(`Storage: creating object store "bundles" in IndexedDB`)
                db.createObjectStore(STORE_BUNDLES, { keyPath: 'addr' })
            }

            if (!db.objectStoreNames.contains(STORE_PROFILES)) {
                console.debug(`Storage: creating object store "profiles" in IndexedDB`)
                db.createObjectStore(STORE_PROFILES, { keyPath: 'addr' })
            }

            if (!db.objectStoreNames.contains(STORE_SECRETS)) {
                console.debug(`Storage: creating object store "secrets" in IndexedDB`)
                db.createObjectStore(STORE_SECRETS, { keyPath: 'addr' })
            }
        }
    }

    cacheProfile(profile: PlayerProfileWithPfp): void {
        const request = indexedDB.open(DB_KEY, DB_VER)

        request.onsuccess = _e => {
            let db = request.result
            let tx = db.transaction(STORE_PROFILES, 'readwrite')
            let store = tx.objectStore(STORE_PROFILES)
            // Allow replace the old one
            store.put(profile)

            tx.oncomplete = () => {}
            tx.onerror = () => {
                console.error(tx.error, 'Failed to cache profile')
            }
            tx.onabort = () => {
                console.warn('Caching profile aborted')
            }
        }
    }

    getProfile(profileAddr: string): Promise<PlayerProfileWithPfp | undefined> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_KEY, DB_VER)
            request.onsuccess = _e => {
                let db = request.result
                let read = db.transaction(STORE_PROFILES, 'readonly').objectStore(STORE_PROFILES).get(profileAddr)
                read.onsuccess = _e => {
                    const profile = read.result as PlayerProfileWithPfp | undefined
                    resolve(profile)
                }
                read.onerror = _e => {
                    reject(read.error)
                }
            }
        })
    }

    cacheTokens(tokens: IToken[]) {
        const request = indexedDB.open(DB_KEY, DB_VER)

        request.onsuccess = _e => {
            let db = request.result
            let tx = db.transaction(STORE_TOKENS, 'readwrite')
            let store = tx.objectStore(STORE_TOKENS)
            tokens.forEach(token => store.add(token))

            tx.oncomplete = () => {}
            tx.onerror = () => {
                console.error(tx.error, 'Failed to cache tokens')
            }
            tx.onabort = () => {
                console.warn('Caching token aborted')
            }
        }
    }

    getTokens(tokenAddrs: string[]): Promise<Array<IToken | undefined>> {
        return new Promise((resolve, _reject) => {
            const request = indexedDB.open(DB_KEY, DB_VER)
            request.onsuccess = _e => {
                let db = request.result
                let results: Array<IToken | undefined> = []
                let count = 0
                for (const tokenAddr of tokenAddrs) {
                    let read = db.transaction(STORE_TOKENS, 'readonly').objectStore(STORE_TOKENS).get(tokenAddr)
                    read.onsuccess = _e => {
                        const token = read.result as IToken | undefined
                        results.push(token)
                        count++
                        if (count === tokenAddrs.length) {
                            resolve(results)
                        }
                    }
                    read.onerror = _e => {
                        console.error(read.error, 'Error fetching token')
                        count++
                    }
                }
            }
        })
    }

    cacheNft(nft: INft) {
        const request = indexedDB.open(DB_KEY, DB_VER)

        request.onsuccess = _e => {
            let db = request.result
            let tx = db.transaction(STORE_NFTS, 'readwrite')
            let store = tx.objectStore(STORE_NFTS)

            store.add(nft)

            tx.oncomplete = () => {
                console.log('Cached nft:', nft)
            }
        }
    }

    getNft(nftAddr: string): Promise<INft | undefined> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_KEY, DB_VER)
            request.onsuccess = _e => {
                let db = request.result
                let read = db.transaction(STORE_NFTS, 'readonly').objectStore(STORE_NFTS).get(nftAddr)
                read.onsuccess = _e => {
                    const nft = read.result as INft | undefined
                    resolve(nft)
                }
                read.onerror = _e => {
                    reject(read.error)
                }
            }
        })
    }


    cacheBundle(bundle: IGameBundle) {
        const request = indexedDB.open(DB_KEY, DB_VER)

        request.onsuccess = _e => {
            let db = request.result
            let tx = db.transaction(STORE_BUNDLES, 'readwrite')
            let store = tx.objectStore(STORE_BUNDLES)

            store.add(bundle)

            tx.oncomplete = () => {
                console.log('Cached bundle:', bundle)
            }
        }
    }

    getBundle(bundleAddr: string): Promise<IGameBundle | undefined> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_KEY, DB_VER)
            request.onsuccess = _e => {
                let db = request.result
                let read = db.transaction(STORE_BUNDLES, 'readonly').objectStore(STORE_BUNDLES).get(bundleAddr)
                read.onsuccess = _e => {
                    const bundle = read.result as IGameBundle | undefined
                    resolve(bundle)
                }
                read.onerror = _e => {
                    reject(read.error)
                }
            }
        })
    }

    cacheSecret(addr: string, secret: Uint8Array) {
        const obj = { addr, secret }
        const request = indexedDB.open(DB_KEY, DB_VER)
        request.onsuccess = _e => {
            let db = request.result
            let tx = db.transaction(STORE_SECRETS, 'readwrite')
            let store = tx.objectStore(STORE_SECRETS)

            store.add(obj)

            tx.oncomplete = () => {
                console.log('Cached credentials secret')
            }
        }
    }

    getSecret(addr: string): Promise<Uint8Array | undefined> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_KEY, DB_VER)
            request.onsuccess = _e => {
                let db = request.result
                let read = db.transaction(STORE_SECRETS, 'readonly').objectStore(STORE_SECRETS).get(addr)
                read.onsuccess = _e => {
                    const obj = read.result as SecretObject | undefined
                    resolve(obj?.secret)
                }
                read.onerror = _e => {
                    reject(read.error)
                }
            }
        })
    }
}

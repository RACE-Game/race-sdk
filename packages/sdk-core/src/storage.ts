import { Nft, Token } from "./accounts"
import { EncryptorExportedKeys } from "./encryptor"
import { PlayerProfileWithPfp } from "./types"

const DB_KEY = 'race-protocol'
const DB_VER = 2

export interface IStorage {
    cacheTokens(tokens: Token[]): void

    getTokens(tokenAddrs: string[]): Promise<Array<Token | undefined>>

    cacheNft(token: Nft): void

    getNft(nftAddr: string): Promise<Nft | undefined>

    cacheEncryptorKeys(keys: EncryptorExportedKeys): void

    getEncryptorKeys(playerAddr: string): Promise<EncryptorExportedKeys | undefined>

    cacheProfile(profile: PlayerProfileWithPfp): void

    getProfile(profileAddr: string): Promise<PlayerProfileWithPfp | undefined>
}

export class Storage implements IStorage {

    constructor() {
        const request = indexedDB.open(DB_KEY, DB_VER)
        request.onupgradeneeded = (_e: IDBVersionChangeEvent) => {
            const db = request.result

            console.debug('Storage: creating object stores in IndexedDB')

            if (!db.objectStoreNames.contains('tokens')) {
                console.debug(`Storage: creating object store "tokens" in IndexedDB`)
                db.createObjectStore('tokens', { keyPath: 'addr' })
            }

            if (!db.objectStoreNames.contains('nfts')) {
                console.debug(`Storage: creating object store "nfts" in IndexedDB`)
                db.createObjectStore('nfts', { keyPath: 'addr' })
            }

            if (!db.objectStoreNames.contains('profiles')) {
                console.debug(`Storage: creating object store "profiles" in IndexedDB`)
                db.createObjectStore('profiles', { keyPath: 'addr' })
            }

            if (!db.objectStoreNames.contains('encryptor-keys')) {
                console.debug(`Storage: creating object store "encryptor-keys" in IndexedDB`)
                db.createObjectStore('encryptor-keys', { keyPath: 'playerAddr' })
            }
        }
    }

    cacheProfile(profile: PlayerProfileWithPfp): void {
        const request = indexedDB.open(DB_KEY, DB_VER)

        request.onsuccess = _e => {
            let db = request.result
            let tx = db.transaction('profiles', 'readwrite')
            let store = tx.objectStore('profiles')
            // Allow replace the old one
            store.put(profile)

            tx.oncomplete = () => {
            }
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
                let read = db.transaction('profiles', 'readonly').objectStore('profiles').get(profileAddr)
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

    cacheTokens(tokens: Token[]) {
        const request = indexedDB.open(DB_KEY, DB_VER)

        request.onsuccess = _e => {
            let db = request.result
            let tx = db.transaction('tokens', 'readwrite')
            let store = tx.objectStore('tokens')
            tokens.forEach(token => store.add(token))

            tx.oncomplete = () => {
            }
            tx.onerror = () => {
                console.error(tx.error, 'Failed to cache tokens')
            }
            tx.onabort = () => {
                console.warn('Caching token aborted')
            }
        }
    }

    getTokens(tokenAddrs: string[]): Promise<Array<Token | undefined>> {
        return new Promise((resolve, _reject) => {
            const request = indexedDB.open(DB_KEY, DB_VER)
            request.onsuccess = _e => {
                let db = request.result
                let results: Array<Token | undefined> = []
                let count = 0
                for (const tokenAddr of tokenAddrs) {
                    let read = db.transaction('tokens', 'readonly').objectStore('tokens').get(tokenAddr)
                    read.onsuccess = _e => {
                        const token = read.result as Token | undefined
                        results.push(token)
                        count ++
                        if (count === tokenAddrs.length) {
                            resolve(results)
                        }
                    }
                    read.onerror = _e => {
                        console.error(read.error, 'Error fetching token')
                        count ++
                    }
                }
            }
        })
    }

    cacheNft(nft: Nft) {
        const request = indexedDB.open(DB_KEY, DB_VER)

        request.onsuccess = _e => {
            let db = request.result
            let tx = db.transaction('nfts', 'readwrite')
            let store = tx.objectStore('nfts')

            store.add(nft)

            tx.oncomplete = () => {
                console.log('Cached nft:', nft)
            }
        }
    }

    getNft(nftAddr: string): Promise<Nft | undefined> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_KEY, DB_VER)
            request.onsuccess = _e => {
                let db = request.result
                let read = db.transaction('nfts', 'readonly').objectStore('nfts').get(nftAddr)
                read.onsuccess = _e => {
                    const nft = read.result as Nft | undefined
                    resolve(nft)
                }
                read.onerror = _e => {
                    reject(read.error)
                }
            }
        })
    }

    cacheEncryptorKeys(keys: EncryptorExportedKeys) {
        const request = indexedDB.open(DB_KEY, DB_VER)
        request.onsuccess = _e => {
            let db = request.result
            let tx = db.transaction('encryptor-keys', 'readwrite')
            let store = tx.objectStore('encryptor-keys')

            store.add(keys)

            tx.oncomplete = () => {
                console.log('Cached encryptor keys')
            }
        }
    }

    getEncryptorKeys(playerAddr: string): Promise<EncryptorExportedKeys | undefined> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_KEY, DB_VER)
            request.onsuccess = _e => {
                let db = request.result
                let read = db.transaction('encryptor-keys', 'readonly').objectStore('encryptor-keys').get(playerAddr)
                read.onsuccess = _e => {
                    const keys = read.result as EncryptorExportedKeys | undefined
                    resolve(keys)
                }
                read.onerror = _e => {
                    reject(read.error)
                }
            }
        })
    }
}

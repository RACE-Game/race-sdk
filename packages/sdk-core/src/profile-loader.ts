import { INft } from './accounts'
import { IStorage } from './storage'
import { ITransport } from './transport'
import { PlayerProfileWithPfp, ProfileCallbackFunction } from './types'

export interface IProfileLoader {
    getProfile(playerAddr: string): PlayerProfileWithPfp | undefined
    notify(profile: PlayerProfileWithPfp): void
    load(playerAddrs: string[]): Promise<void>
}

export class ProfileLoader implements IProfileLoader {
    __transport: ITransport
    __onProfile: ProfileCallbackFunction | undefined
    __profiles: Map<string, PlayerProfileWithPfp>
    __storage?: IStorage

    constructor(transport: ITransport, storage: IStorage | undefined, onProfile: ProfileCallbackFunction | undefined) {
        this.__transport = transport
        this.__onProfile = onProfile
        this.__profiles = new Map()
        this.__storage = storage
    }

    getProfile(playerAddr: string): PlayerProfileWithPfp | undefined {
        return this.__profiles.get(playerAddr)
    }

    notify(profile: PlayerProfileWithPfp) {
        if (this.__onProfile) {
            this.__onProfile(profile)
        }
    }

    async __getNft(addr: string): Promise<INft | undefined> {
        if (!this.__storage) {
            return await this.__transport.getNft(addr)
        } else {
            const cachedNft = await this.__storage.getNft(addr)
            if (cachedNft) {
                return cachedNft
            }
            const nft = await this.__transport.getNft(addr)
            if (nft) {
                this.__storage.cacheNft(nft)
            }
            return nft
        }
    }

    async load(playerAddrs: string[]) {
        // 1, try to query the profiles those are already loaded
        let addrsToLoad: string[] = [] // For those not cached
        for (const addr of playerAddrs) {
            const profile = this.__profiles.get(addr)
            if (!profile) {
                addrsToLoad.push(addr)
            } else {
                this.notify(profile)
            }
        }

        if (addrsToLoad.length > 0) {
            // 2, try to serve the profile from storage
            let addrsToLoad2: string[] = [] // For those never loaded
            if (this.__storage) {
                for (const addr of addrsToLoad) {
                    const profile = await this.__storage.getProfile(addr)
                    if (profile) {
                        this.__profiles.set(addr, profile)
                        this.notify(profile)
                    } else {
                        addrsToLoad2.push(addr)
                    }
                }
            } else {
                addrsToLoad2 = addrsToLoad // When storage is not available.
            }

            // 3, load rest profiles
            if (addrsToLoad2.length > 0) {
                const profiles = await this.__transport.listPlayerProfiles(addrsToLoad2)
                for (const profile of profiles) {
                    if (profile) {
                        let nft = undefined
                        if (profile.pfp) {
                            nft = await this.__getNft(profile.pfp)
                        }
                        const profileWithPfp = { pfp: nft, nick: profile.nick, addr: profile.addr, credentials: profile.credentials }
                        this.__profiles.set(profile.addr, profileWithPfp)
                        this.notify(profileWithPfp)
                        if (this.__storage) {
                            this.__storage.cacheProfile(profileWithPfp)
                        }
                    }
                }
            }
        }
    }
}

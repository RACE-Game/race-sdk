import { INft } from './accounts'
import { IStorage } from './storage'
import { ITransport } from './transport'
import { PlayerProfile, ProfileCallbackFunction } from './types'

export interface IProfileLoader {
    getProfile(playerAddr: string): PlayerProfile | undefined
    load(playerAddrs: string[], onProfile: ProfileCallbackFunction | undefined,  storage?: IStorage): Promise<void>
}

/** Async profile loader
 *
 * Call `load` function to load a list of profiles by their addresses.
 * The `onProfile` callback is called every time a profile is partially or fully loaded
 *
 * For profiles already loaded, the `onProfile` will be called once.
 * For profiles without pfp, the `onProfile` will be called once.
 * For profiles with pfp, the `onProfile` will be called twice.
 */
export class ProfileLoader implements IProfileLoader {
    __transport: ITransport
    __onProfile: ProfileCallbackFunction | undefined
    __profiles: Map<string, PlayerProfile>

    constructor(transport: ITransport) {
        this.__transport = transport
        this.__profiles = new Map()
    }

    getProfile(playerAddr: string): PlayerProfile | undefined {
        return this.__profiles.get(playerAddr)
    }

    async __getNft(addr: string, storage?: IStorage): Promise<INft | undefined> {
        if (!storage) {
            return await this.__transport.getNft(addr)
        } else {
            const cachedNft = await storage.getNft(addr)
            if (cachedNft) {
                return cachedNft
            }
            const nft = await this.__transport.getNft(addr)
            if (nft) {
                storage.cacheNft(nft)
            }
            return nft
        }
    }

    async load(playerAddrs: string[], onProfile?: ProfileCallbackFunction, storage?: IStorage) {

        if (!onProfile) console.warn('ProfileLoader.load: onProfile callback is not provided')

        // 1, try to query the profiles those are already loaded
        let addrsToLoad: string[] = [] // For those not cached
        let profilesToLoadPfp: Array<[PlayerProfile, string]> = [] // For those to load pfps later, each item is [profile, pfpAddr]

        for (const addr of playerAddrs) {
            const profile = this.__profiles.get(addr)
            if (!profile) {
                addrsToLoad.push(addr)
            } else {
                if (onProfile) onProfile(profile)
            }
        }

        // 2, load rest profiles
        if (addrsToLoad.length > 0) {
            const profiles = await this.__transport.listPlayerProfiles(addrsToLoad)
            for (const profile of profiles) {
                if (profile) {
                    const profileWithoutPfp = { pfp: undefined, pfpAddr: profile.pfp, addr: profile.addr, nick: profile.nick, credentials: profile.credentials }
                    if (onProfile) onProfile(profileWithoutPfp)

                    if (profile.pfp) {
                        profilesToLoadPfp.push([profileWithoutPfp, profile.pfp])
                    }
                    this.__profiles.set(profile.addr, profileWithoutPfp)
                }
            }
        }

        // 3, start a background job to load profile pfps
        // This function returns without waiting for them to be loaded.
        if (profilesToLoadPfp.length > 0) {
            (async () => {
                console.debug(`Loading PFPs for ${profilesToLoadPfp.length} profiles`)

                for (const [profile, pfpAddr] of profilesToLoadPfp) {
                    const nft = await this.__getNft(pfpAddr, storage)
                    if (nft) {
                        const profileWithPfp = { pfp: nft, pfpAddr, addr: profile.addr, nick: profile.nick, credentials: profile.credentials }
                        this.__profiles.set(profile.addr, profileWithPfp)
                        if (onProfile) onProfile(profileWithPfp)
                    } else {
                        // Failed to load the profile pfp, still save current profile
                        this.__profiles.set(profile.addr, profile)
                    }
                }

                console.debug('PFP loading completed')
            })()
        }
    }
}

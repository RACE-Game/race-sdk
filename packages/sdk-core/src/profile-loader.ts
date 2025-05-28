import { ITransport } from './transport'
import { PlayerProfileWithPfp, ProfileCallbackFunction } from './types'

type LoadProfileParams = {
    id: bigint
    addr: string
}[]

export interface IProfileLoader {
    getProfile(playerAddr: string): PlayerProfileWithPfp | undefined
    notify(profile: PlayerProfileWithPfp): void
    load(params: LoadProfileParams): Promise<void>
}

export class ProfileLoader implements IProfileLoader {
    __transport: ITransport
    __addrToId: Map<string, bigint>
    __onProfile: ProfileCallbackFunction | undefined
    __profiles: Map<string, PlayerProfileWithPfp>

    constructor(transport: ITransport, onProfile: ProfileCallbackFunction | undefined) {
        this.__transport = transport
        this.__onProfile = onProfile
        this.__profiles = new Map()
        this.__addrToId = new Map()
    }

    getProfile(playerAddr: string): PlayerProfileWithPfp | undefined {
        return this.__profiles.get(playerAddr)
    }

    notify(profile: PlayerProfileWithPfp) {
        if (this.__onProfile) {
            this.__onProfile(this.__addrToId.get(profile.addr), profile)
        }
    }

    async load(params: LoadProfileParams) {
        let addrsToLoad: string[] = []
        // If the profile is already loaded, we skip it.
        // If the profile is loaded, but the id is changed, we notify with new id.
        // Then we load the rest in batch.
        params.forEach(p => {
            const oldId = this.__addrToId.get(p.addr)
            const profile = this.__profiles.get(p.addr)
            if (!oldId) {
                this.__addrToId.set(p.addr, p.id)
                addrsToLoad.push(p.addr)
            } else if (profile && oldId !== p.id) {
                addrsToLoad.push(p.addr)
                this.notify(profile)
            }
        })
        const profiles = await this.__transport.listPlayerProfiles(addrsToLoad)
        for (const profile of profiles) {
            if (profile) {
                let nft = undefined
                if (profile.pfp) {
                    nft = await this.__transport.getNft(profile.pfp)
                }
                const profileWithNft = { pfp: nft, nick: profile.nick, addr: profile.addr }
                this.notify(profileWithNft)
            }
        }
    }
}

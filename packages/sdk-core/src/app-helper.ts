import { GameAccount, Nft, Token, TokenBalance, RecipientAccount } from './accounts'
import { CheckpointOffChain } from './checkpoint'
import { ResponseHandle, ResponseStream } from './response'
import {
    AttachBonusError,
    AttachBonusItem,
    AttachBonusResponse,
    CreateGameAccountParams,
    CreateGameError,
    CreateGameResponse,
    CreatePlayerProfileError,
    CreatePlayerProfileResponse,
    ITransport,
    RecipientClaimError,
    RecipientClaimResponse,
    RegisterGameError,
    RegisterGameResponse,
    CloseGameAccountResponse,
    CloseGameAccountError,
    JoinResponse,
    JoinError,
    DepositResponse,
    DepositError,
} from './transport'
import { PlayerProfileWithPfp } from './types'
import { getLatestCheckpoints } from './connection'
import { IPublicKeyRaws } from './encryptor'
import { IStorage } from './storage'

export type AppHelperInitOpts<W> = {
    transport: ITransport<W>
}

export type ClaimPreview = {
    tokenAddr: string
    amount: bigint
}

export type JoinOpts = {
    addr: string
    amount: bigint
    position?: number
    keys: IPublicKeyRaws
    createProfileIfNeeded?: boolean
}

export type DepositOpts = {
    addr: string
    amount: bigint
}

/**
 * The helper for common interaction.
 */
export class AppHelper<W> {
    __transport: ITransport<W>

    constructor(transport: ITransport<W>)
    constructor(opts: AppHelperInitOpts<W>)
    constructor(transportOrOpts: ITransport<W> | AppHelperInitOpts<W>) {
        if ('transport' in transportOrOpts) {
            const { transport } = transportOrOpts
            this.__transport = transport
        } else {
            this.__transport = transportOrOpts
        }
    }

    /**
     * Get the game account by game address.
     *
     * @param addr - The address of game account
     * @returns An object of GameAccount or undefined when not found
     */
    async getGame(addr: string): Promise<GameAccount | undefined> {
        return await this.__transport.getGameAccount(addr)
    }

    /**
     * Create a game account.
     *
     * @param wallet - The wallet adapter to sign the transaction
     * @param params - Parameters for game creation
     * @returns The address of created game
     */
    createGame(wallet: W, params: CreateGameAccountParams): ResponseStream<CreateGameResponse, CreateGameError> {
        if (params.title.length == 0 || params.title.length > 16) {
            throw new Error('Invalid title')
        }

        if (params.entryType.kind === 'cash') {
            const entryType = params.entryType
            if (entryType.minDeposit <= 0) {
                throw new Error('Invalid minDeposit')
            }
            if (entryType.maxDeposit < entryType.minDeposit) {
                throw new Error('Invalid maxDeposit')
            }
        } else if (params.entryType.kind === 'ticket') {
            const entryType = params.entryType
            if (entryType.amount <= 0) {
                throw new Error('Invalid ticket price')
            }
        } else {
            throw new Error('Unsupported entry type')
        }

        if (params.maxPlayers < 1 || params.maxPlayers > 512) {
            throw new Error('Invalid maxPlayers')
        }

        let response = new ResponseHandle<CreateGameResponse, CreateGameError>()
        this.__transport.createGameAccount(wallet, params, response)

        return response.stream()
    }

    /**
     * Register a game to a registration account.
     *
     * @param wallet - The wallet adapter to sign the transaction
     * @param gameAddr - The address of game account.
     * @param regAddr - The address of registration account.
     */
    registerGame(
        wallet: W,
        gameAddr: string,
        regAddr: string
    ): ResponseStream<RegisterGameResponse, RegisterGameError> {
        const response = new ResponseHandle<RegisterGameResponse, RegisterGameError>()
        this.__transport.registerGame(
            wallet,
            {
                gameAddr,
                regAddr,
            },
            response
        )

        return response.stream()
    }

    /**
     * Initiates the creation of a player profile using the provided wallet, nickname, and optional profile picture.
     * @param {IWallet} wallet - The wallet associated with the player.
     * @param {string} nick - The nickname for the player.
     * @param {string | undefined} pfp - The profile picture for the player, if any.
     * @returns {ResponseStream<CreatePlayerProfileResponse, CreatePlayerProfileError>} - A stream of responses indicating the success or failure of the operation.
     */
    createProfile(
        wallet: W,
        nick: string,
        pfp?: string
    ): ResponseStream<CreatePlayerProfileResponse, CreatePlayerProfileError> {
        const response = new ResponseHandle<CreatePlayerProfileResponse, CreatePlayerProfileError>()

        this.__transport.createPlayerProfile(wallet, { nick, pfp }, response)

        return response.stream()
    }

    /**
     * Attaches bonuses to the specified game address within a wallet and returns a response stream.
     *
     * @param wallet - The wallet object implementing the IWallet interface.
     * @param gameAddr - The address of the game to attach bonuses to.
     * @param bonuses - An array of AttachBonusItem objects representing the bonuses to be attached.
     * @returns A ResponseStream which provides the result of the operation with either an AttachBonusResponse or an AttachBonusError.
     */
    attachBonus(
        wallet: W,
        gameAddr: string,
        bonuses: AttachBonusItem[]
    ): ResponseStream<AttachBonusResponse, AttachBonusError> {
        const response = new ResponseHandle<AttachBonusResponse, AttachBonusError>();

        this.__transport.attachBonus(wallet, { gameAddr, bonuses }, response);

        return response.stream()
    }

    /**
     * Initiates the process to close a game account.
     *
     * @param wallet - An interface representing the user's wallet.
     * @param regAddr - A string representing the registration address for the game.
     * @param gameAddr - A string representing the address of the game account to be closed.
     * @returns A ResponseStream that emits either a CloseGameAccountResponse or a CloseGameAccountError.
     */
    closeGame(
        wallet: W,
        regAddr: string,
        gameAddr: string
    ): ResponseStream<CloseGameAccountResponse, CloseGameAccountError> {
        const response = new ResponseHandle<CloseGameAccountResponse, CloseGameAccountError>();

        this.__transport.closeGameAccount(wallet, { regAddr, gameAddr }, response);

        return response.stream();
    }

    /**
     * Get a list of latest checkpoints by game accounts.
     * The returned CheckpointOffChain will be in the same order as given gameAccounts.
     *
     * @param gameAccounts
     * @returns The latest checkpoint from transactor or undefined when it's not available.
     */
    async fetchLatestCheckpoints(gameAccounts: GameAccount[]): Promise<(CheckpointOffChain | undefined)[]> {
        const endpointToAddrs = new Map<string, string[]>();
        const addrToGameAccountIndex = new Map<string, number>();

        gameAccounts.forEach((gameAccount, index) => {
            const { addr, transactorAddr, servers } = gameAccount;

            if (transactorAddr) {
                const server = servers.find(s => s.addr === transactorAddr);
                if (server) {
                    const endpoint = server.endpoint;
                    if (!endpointToAddrs.has(endpoint)) {
                        endpointToAddrs.set(endpoint, []);
                    }
                    endpointToAddrs.get(endpoint)!.push(addr);
                    addrToGameAccountIndex.set(addr, index);
                }
            }
        });

        const results = new Array<CheckpointOffChain | undefined>(gameAccounts.length);
        const t = new Date()

        // Request checkpoints for each unique endpoint
        await Promise.all(Array.from(endpointToAddrs.entries()).map(async ([endpoint, addrs]) => {
            try {
                const checkpoints = await getLatestCheckpoints(endpoint, addrs);

                // Match the received checkpoints to the original gameAccounts order
                checkpoints.forEach((checkpoint, idx) => {
                    const addr = addrs[idx];
                    const index = addrToGameAccountIndex.get(addr);
                    if (index !== undefined) {
                        results[index] = checkpoint;
                    }
                });
            } catch (err) {
                console.error(err, `Failed to fetch checkpoints from endpoint ${endpoint}`);
            }
        }));

        console.log(`Fetching checkpoints cost ${(new Date().getTime() - t.getTime())} ms`)

        return results;
    }

    /**
     * Get a player profile.
     *
     * @param addr - The address of player profile account
     * @param storage - Storage for caching NFT fetch
     * @returns The player profile account or undefined when not found
     */
    async getProfile(addr: string, storage?: IStorage): Promise<PlayerProfileWithPfp | undefined> {
        const profile = await this.__transport.getPlayerProfile(addr)
        if (profile === undefined) return undefined
        if (profile.pfp !== undefined) {
            const pfp = await this.getNft(profile.pfp, storage)
            return { nick: profile.nick, addr: profile.addr, pfp }
        } else {
            return { nick: profile.nick, addr: profile.addr, pfp: undefined }
        }
    }

    /**
     * List games from a list of registration accounts.
     *
     * @param registrationAddrs - The addresses of registration accounts
     * @return A list of games
     */
    async listGames(registrationAddrs: string[]): Promise<GameAccount[]> {
        return (await Promise.all(registrationAddrs.map(async regAddr => {
            const reg = await this.__transport.getRegistration(regAddr)
            const gameAddrs = reg?.games.map(g => g.addr)
            if (gameAddrs) {
                return await this.__transport.listGameAccounts(gameAddrs)
            } else {
                console.warn(`No game found in registration: ${regAddr}`)
                return []
            }
        }))).flat()
    }

    /**
     * List tokens.
     *
     * @return A list of token info.
     */
    async listTokens(tokenAddrs: string[], storage?: IStorage): Promise<Token[]> {
        if (!storage) {
            return await this.__transport.listTokens(tokenAddrs)
        } else {
            let tokens: Token[] = []
            let cachedTokens = await storage.getTokens(tokenAddrs)

            for (const token of cachedTokens) {
                if (token !== undefined) {
                    tokens.push(token)
                }
            }
            const cachedAddrs = tokens.map(token => token.addr)
            const addrsToFetch = tokenAddrs.filter(addr => !cachedAddrs.includes(addr))
            const fetchedTokens = await this.__transport.listTokens(addrsToFetch)
            storage.cacheTokens(fetchedTokens)
            tokens.push(...fetchedTokens)
            return tokens
        }
    }

    /**
     * List tokens with their balance.
     *
     * @return A list of token info.
     */
    async listTokenBalance(walletAddr: string, tokenAddrs: string[]): Promise<TokenBalance[]> {
        return await this.__transport.listTokenBalance(walletAddr, tokenAddrs)
    }

    /**
     * List all nfts owned by a wallet.
     *
     * @param walletAddr - wallet address.
     * @param collectionName - The collection name for filtering, pass `undefined` for no filtering.
     *
     * @return A list of nfts.
     */
    async listNfts(walletAddr: string, collection: string | undefined = undefined): Promise<Nft[]> {
        const nfts = await this.__transport.listNfts(walletAddr)
        if (collection === undefined) {
            return nfts
        } else {
            return nfts.filter(nft => nft.collection === collection)
        }
    }

    /**
     * Get NFT by address
     *
     * @param addr - The address of NFT
     * @param storage - The storage for caching
     */
    async getNft(addr: string, storage?: IStorage): Promise<Nft | undefined> {
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

    /**
     * Claim the fees collected by game.
     *
     * @param wallet - The wallet adapter to sign the transaction
     * @param gameAddr - The address of game account.
     */
    claim(wallet: W, recipientAddr: string): ResponseStream<RecipientClaimResponse, RecipientClaimError> {
        const response = new ResponseHandle<RecipientClaimResponse, RecipientClaimError>()
        this.__transport.recipientClaim(wallet, { recipientAddr }, response)
        return response.stream()
    }

    async getRecipient(recipientAddr: string): Promise<RecipientAccount | undefined> {
        return await this.__transport.getRecipient(recipientAddr)
    }


    /**
     * Initiates a join request for a game session. It exports a public key and
     * sends a join request with required parameters like game address, amount,
     * position, and whether to create a profile if needed. Returns a stream to
     * handle the response of the join operation, which can either be a success
     * (JoinResponse) or an error (JoinError).
     *
     * @param {JoinOpts} params - Options and parameters to configure the join request.
     * @returns {ResponseStream<JoinResponse, JoinError>} A stream to handle the
     * response of the join request.
     */
    join(wallet: W, params: JoinOpts): ResponseStream<JoinResponse, JoinError> {
        const response = new ResponseHandle<JoinResponse, JoinError>()

        this.__transport.join(
            wallet,
            {
                gameAddr: params.addr,
                amount: params.amount,
                position: params.position || 0,
                verifyKey: params.keys.ec,
                createProfileIfNeeded: params.createProfileIfNeeded,
            },
            response
        )


        return response.stream()
    }

    deposit(wallet: W, params: DepositOpts): ResponseStream<DepositResponse, DepositError> {
        const response = new ResponseHandle<DepositResponse, DepositError>()

        this.__transport.getGameAccount(params.addr).then(gameAccount => {
            this.__transport.deposit(
                wallet,
                {
                    gameAddr: params.addr,
                    amount: params.amount,
                    settleVersion: gameAccount?.settleVersion || 0n, // SHOULD NEVER BE ZERO
                },
                response,
            )
        })

        return response.stream()
    }

    /**
     * Preview the claim information.
     *
     * @param wallet - The wallet adapter to sign the transaction
     * @param recipientAddr | recipientAccount - The address of a recipient account.
     */
    previewClaim(wallet: W, recipientAddr: string): Promise<ClaimPreview[]>
    previewClaim(wallet: W, recipientAccount: RecipientAccount): Promise<ClaimPreview[]>
    async previewClaim(wallet: W, recipient: RecipientAccount | string): Promise<ClaimPreview[]> {
        try {
            if (typeof recipient === 'string') {
                const r = await this.__transport.getRecipient(recipient)
                if (r === undefined) {
                    throw new Error('Recipient account not found')
                }
                recipient = r
            }

            let ret: ClaimPreview[] = []
            for (const slot of recipient.slots) {
                let weights = 0
                let totalWeights = 0
                let totalClaimed = 0n
                let claimed = 0n
                for (const share of slot.shares) {
                    totalClaimed += share.claimAmount
                    totalWeights += share.weights

                    if (share.owner.kind === 'assigned' && share.owner.addr === this.__transport.walletAddr(wallet)) {
                        weights += share.weights
                        claimed += share.claimAmount
                    }
                }
                const totalAmount = totalClaimed + slot.balance
                const amountToClaim = (totalAmount * BigInt(weights) / BigInt(totalWeights)) - claimed
                if (amountToClaim > 0n) {
                    ret.push({
                        amount: amountToClaim,
                        tokenAddr: slot.tokenAddr,
                    })
                }
            }

            return ret
        } catch (e) {
            console.log(e)
            return []
        }
    }
}

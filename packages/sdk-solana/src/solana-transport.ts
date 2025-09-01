import {
    Commitment,
    Rpc,
    createSolanaRpcFromTransport,
    createDefaultRpcTransport,
    SolanaRpcApi,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    address,
    Address,
    TransactionMessage,
    pipe,
    partiallySignTransaction,
    appendTransactionMessageInstructions,
    IInstruction,
    generateKeyPairSigner,
    getProgramDerivedAddress,
    KeyPairSigner,
    TransactionSigner,
    compileTransaction,
    TransactionMessageWithBlockhashLifetime,
    ITransactionMessageWithFeePayer,
    createAddressWithSeed,
    Blockhash,
    Transaction,
    Signature,
    getBase58Encoder,
    getBase58Decoder,
    getTransactionEncoder,
    TransactionSendingSigner,
    TransactionSendingSignerConfig,
    SignatureBytes,
    MaybeAccount,
    RpcTransportFromClusterUrl,
    RpcTransport,
} from '@solana/kit'
import * as SPL from '@solana-program/token'
import {
    ITransport,
    CreateGameAccountParams,
    CloseGameAccountParams,
    JoinParams,
    DepositParams,
    VoteParams,
    CreatePlayerProfileParams,
    CreateRegistrationParams,
    RegisterGameParams,
    UnregisterGameParams,
    GameAccount,
    GameBundle,
    PlayerProfile,
    ServerAccount,
    RegistrationAccount,
    Token,
    Nft,
    RecipientAccount,
    RecipientSlot,
    RecipientClaimParams,
    TokenBalance,
    ResponseHandle,
    CreateGameResponse,
    CreateGameError,
    JoinError,
    RecipientClaimResponse,
    RecipientClaimError,
    CreatePlayerProfileError,
    Result,
    JoinResponse,
    CreatePlayerProfileResponse,
    CreateRecipientResponse,
    CreateRecipientError,
    CreateRecipientParams,
    DepositResponse,
    DepositError,
    AttachBonusParams,
    AttachBonusResponse,
    AttachBonusError,
    CloseGameAccountResponse,
    CloseGameAccountError,
    SendTransactionResult,
    AddRecipientSlotParams,
    AddRecipientSlotResponse,
    AddRecipientSlotError,
} from '@race-foundation/sdk-core'
import * as instruction from './instruction'

import {
    GAME_ACCOUNT_LEN,
    NAME_LEN,
    PROFILE_ACCOUNT_LEN,
    PLAYER_PROFILE_SEED,
    RECIPIENT_ACCOUNT_LEN,
    NATIVE_MINT,
    SERVER_PROFILE_SEED,
    PLAYERS_REG_INIT_LEN,
    PLAYER_INFO_LEN,
} from './constants'

import {
    EntryTypeCash,
    EntryTypeTicket,
    GameState,
    PlayerState,
    PlayersRegState,
    RecipientSlotOwnerAssigned,
    RecipientSlotOwnerUnassigned,
    RecipientState,
    RegistryState,
    ServerState,
} from './accounts'

import { PROGRAM_ID, METAPLEX_PROGRAM_ID } from './constants'
import { Metadata } from './metadata'
import { getCreateAccountInstruction, getCreateAccountWithSeedInstruction } from '@solana-program/system'
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token'
import { createDasRpc, MetaplexDASApi } from './metaplex'
import type { SolanaWalletAdapterWallet } from '@solana/wallet-standard'
import { IdentifierString } from '@wallet-standard/base'

const SolanaSignAndSendTransaction = 'solana:signAndSendTransaction'
const MAX_CONFIRM_TIMES = 32
const MAX_RETRIES_FOR_GET_PLAYERS_REG = 5

type TransactionMessageWithFeePayerAndBlockhashLifetime = TransactionMessage &
    ITransactionMessageWithFeePayer &
    TransactionMessageWithBlockhashLifetime

function base64ToUint8Array(base64: string): Uint8Array {
    const rawBytes = atob(base64)
    const uint8Array = new Uint8Array(rawBytes.length)
    for (let i = 0; i < rawBytes.length; i++) {
        uint8Array[i] = rawBytes.charCodeAt(i)
    }
    return uint8Array
}

function trimString(s: string): string {
    return s.replace(/\0/g, '')
}

type SendTransactionOptions = {
    signers?: KeyPairSigner[]
    commitment?: Commitment
}

export class SolanaTransport implements ITransport<SolanaWalletAdapterWallet> {
    #chain: IdentifierString
    #rpcTransports: RpcTransport[]
    #nextTransport = 0

    walletAddr(wallet: SolanaWalletAdapterWallet): string {
        return wallet.accounts[0].address
    }

    constructor(chain: IdentifierString, endpoints: string[])
    constructor(chain: IdentifierString, endpoint: string)
    constructor(chain: IdentifierString, endpointOrEndponits: string | string[]) {
        if (typeof endpointOrEndponits == 'string') {
            this.#rpcTransports = [createDefaultRpcTransport({ url: endpointOrEndponits })]
        } else {
            this.#rpcTransports = endpointOrEndponits.map(endpoint => createDefaultRpcTransport({ url: endpoint }))
        }

        this.#chain = chain
    }

    roundRobinTransport(): RpcTransport {
        console.log(`use transport: ${this.#nextTransport}`)
        const transport = this.#rpcTransports[this.#nextTransport]
        this.#nextTransport = (this.#nextTransport + 1) % this.#rpcTransports.length
        return transport
    }

    rpc(): Rpc<SolanaRpcApi> {
        return createSolanaRpcFromTransport(this.roundRobinTransport())
    }

    dasRpc(): Rpc<MetaplexDASApi> {
        return createDasRpc(this.roundRobinTransport())
    }

    async createGameAccount(
        wallet: SolanaWalletAdapterWallet,
        params: CreateGameAccountParams,
        response: ResponseHandle<CreateGameResponse, CreateGameError>
    ): Promise<void> {
        console.log('Create game:', params)
        const walletAccount = wallet.accounts[0]

        const payer = this.useTransactionSendingSigner(wallet)
        const { title, bundleAddr, tokenAddr, sponsorPlayerSlots } = params
        if (title.length > NAME_LEN) {
            return response.failed('invalid-title')
        }

        const recipientAccountKey = address(params.recipientAddr)

        const registrationAccountKey = address(params.registrationAddr)

        let ixs: IInstruction[] = []
        let signers: KeyPairSigner[] = []

        const { ixs: createGameAccountIxs, account: gameAccount } = await this._prepareCreateAccount(
            payer,
            GAME_ACCOUNT_LEN,
            PROGRAM_ID
        )

        const { ixs: createPlayersRegAccountIxs, account: playersRegAccount } =
            await this._prepareCreateAccountWithExtraRent(
                payer,
                PLAYERS_REG_INIT_LEN,
                BigInt(sponsorPlayerSlots || 0) * PLAYER_INFO_LEN,
                PROGRAM_ID
            )

        ixs.push(...createGameAccountIxs)
        ixs.push(...createPlayersRegAccountIxs)
        signers.push(playersRegAccount)
        signers.push(gameAccount)

        const tokenMintKey = address(tokenAddr)

        let stakeAccountKey
        if (tokenMintKey == NATIVE_MINT) {
            // For SOL game, use PDA as stake account
            const [pda, _] = await getProgramDerivedAddress({
                programAddress: PROGRAM_ID,
                seeds: [getBase58Encoder().encode(gameAccount.address)],
            })
            stakeAccountKey = pda
            console.info('Game uses SOL as token, use PDA as stake account:', stakeAccountKey)
        } else {
            // For SPL game, use dedicated stake account
            const { tokenAccount: stakeAccount, ixs: createStakeAccountIxs } = await this._prepareCreateTokenAccount(
                payer,
                tokenMintKey
            )
            signers.push(stakeAccount)
            ixs.push(...createStakeAccountIxs)
            stakeAccountKey = stakeAccount.address
            console.info('Game uses SPL as token, use dedicated stake account:', stakeAccountKey)
        }

        const bundleKey = address(bundleAddr)
        const createGame = instruction.createGameAccount({
            ownerKey: payer.address,
            gameAccountKey: gameAccount.address,
            playersRegAccountKey: playersRegAccount.address,
            stakeAccountKey,
            recipientAccountKey: recipientAccountKey,
            mint: tokenMintKey,
            gameBundleKey: bundleKey,
            title: title,
            maxPlayers: params.maxPlayers,
            entryType: params.entryType,
            data: params.data,
        })
        console.info('Transaction Instruction[CreateGame]:', createGame)
        ixs.push(createGame)

        const registerGame = instruction.registerGame({
            ownerKey: payer.address,
            gameAccountKey: gameAccount.address,
            registrationAccountKey,
        })

        console.info('Transaction Instruction[RegisterGame]:', registerGame)
        ixs.push(registerGame)

        const tx = await makeTransaction(this.rpc(), payer, ixs)
        if ('err' in tx) {
            return response.retryRequired(tx.err)
        }

        const sig = await sendTransaction(payer, tx.ok, response, { signers })
        if ('err' in sig) {
            return response.transactionFailed(sig.err)
        }

        const signature = sig.ok

        await confirmSignature(this.rpc(), signature, response, {
            gameAddr: gameAccount.address,
            signature,
        })
    }

    async closeGameAccount(
        wallet: SolanaWalletAdapterWallet,
        params: CloseGameAccountParams,
        response: ResponseHandle<CloseGameAccountResponse, CloseGameAccountError>
    ): Promise<void> {
        const payer = this.useTransactionSendingSigner(wallet)
        const { gameAddr, regAddr } = params

        const gameAccountKey = address(gameAddr)
        const regAccountKey = address(regAddr)

        const gameState = await this._getGameState(gameAccountKey)

        if (gameState === undefined) {
            return response.failed('game-not-found')
        }

        const playersRegAccountKey = gameState.playersRegAccount
        const playersRegState = await this._getPlayersRegState(
            playersRegAccountKey,
            gameState.accessVersion,
            gameState.settleVersion
        )

        if (playersRegState === undefined) {
            return response.failed('players-reg-not-found')
        }

        if (gameState.ownerKey != payer.address) {
            return response.failed('permission-denied')
        }
        const regState = await this._getRegState(regAccountKey)

        if (regState === undefined) {
            return response.failed('reg-not-found')
        }

        if (regState.games.find(g => g.gameKey == gameAccountKey) === undefined) {
            return response.failed('game-not-in-reg')
        }
        const ixs = []
        const [pda, _] = await getProgramDerivedAddress({
            programAddress: PROGRAM_ID,
            seeds: [getBase58Encoder().encode(gameAccountKey)],
        })

        let receiver

        if (gameState.tokenKey == NATIVE_MINT) {
            receiver = payer.address
        } else {
            ;[receiver] = await SPL.findAssociatedTokenPda({
                owner: payer.address,
                tokenProgram: SPL.TOKEN_PROGRAM_ADDRESS,
                mint: gameState.tokenKey,
            })
        }

        const unregisterGameIx = instruction.unregisterGame({
            payerKey: payer.address,
            regAccountKey,
            gameAccountKey,
        })
        ixs.push(unregisterGameIx)
        const stakeKey = gameState.stakeKey
        const closeGameAccountIx = await instruction.closeGame({
            payerKey: payer.address,
            gameAccountKey,
            playersRegAccountKey,
            stakeKey,
            pda,
            receiver,
            gameState,
        })
        ixs.push(closeGameAccountIx)
        const tx = await makeTransaction(this.rpc(), payer, ixs)
        if ('err' in tx) {
            response.retryRequired(tx.err)
            return
        }
        const sig = await sendTransaction(payer, tx.ok, response, {
            commitment: 'confirmed',
        })

        if ('err' in sig) {
            return response.transactionFailed(sig.err)
        }

        const signature = sig.ok

        await confirmSignature(this.rpc(), signature, response, { signature })
    }

    async join(
        wallet: SolanaWalletAdapterWallet,
        params: JoinParams,
        response: ResponseHandle<JoinResponse, JoinError>
    ): Promise<void> {
        const payer = this.useTransactionSendingSigner(wallet)
        const { gameAddr, amount: amountRaw, position, verifyKey } = params
        const gameAccountKey = address(gameAddr)

        // Call RPC functions in Parallel
        const d = new Date()
        const [gameState, playerProfile] = await Promise.all([
            this._getGameState(gameAccountKey),
            this.getPlayerProfile(payer.address),
        ])
        console.debug('Batched RPC calls took %s milliseconds', new Date().getTime() - d.getTime())

        const profileKey0 = playerProfile !== undefined ? address(playerProfile?.addr) : undefined

        if (gameState === undefined) return response.failed('game-not-found')

        const accessVersion = gameState.accessVersion
        const settleVersion = gameState.settleVersion

        const mintKey = gameState.tokenKey
        const isWsol = mintKey == NATIVE_MINT
        const amount = BigInt(amountRaw)

        if (gameState.entryType instanceof EntryTypeCash) {
            if (amount < gameState.entryType.minDeposit || amount > gameState.entryType.maxDeposit) {
                console.warn(
                    `Invalid deposit, maximum = ${gameState.entryType.maxDeposit}, minimum = ${gameState.entryType.minDeposit}, submitted = ${amount}`
                )
                return response.failed('invalid-deposit-amount')
            }
        } else if (gameState.entryType instanceof EntryTypeTicket) {
            if (amount !== gameState.entryType.amount) {
                console.warn(`Invalid deposit, ticket = ${gameState.entryType.amount}, submitted = ${amount}`)
                return response.failed('invalid-deposit-amount')
            }
        } else {
            return response.failed('unsupported-entry-type')
        }

        const stakeAccountKey = gameState.stakeKey

        let ixs: IInstruction[] = []

        let profileKey: Address
        if (profileKey0 !== undefined) {
            profileKey = profileKey0
        } else if (params.createProfileIfNeeded) {
            const createProfile = await this._prepareCreatePlayerProfile(payer, {
                nick: payer.address.substring(0, 6),
            })
            if ('err' in createProfile) {
                return response.failed(createProfile.err)
            }
            const { ixs: createProfileIxs, profileKey: pk } = createProfile.ok
            ixs.push(...createProfileIxs)
            profileKey = pk
        } else {
            return response.failed('profile-not-found')
        }
        let tempAccount
        if (isWsol) {
            const account = await generateKeyPairSigner()
            const ix = getCreateAccountInstruction({
                payer,
                newAccount: account,
                lamports: amount,
                space: 0,
                programAddress: PROGRAM_ID,
            })
            ixs.push(ix)
            tempAccount = account
        } else {
            const { ixs: createTempAccountIxs, tokenAccount: tokenAccount } = await this._prepareCreateTokenAccount(
                payer,
                mintKey
            )
            ixs.push(...createTempAccountIxs)

            const [playerAta] = await SPL.findAssociatedTokenPda({
                owner: payer.address,
                mint: mintKey,
                tokenProgram: SPL.TOKEN_PROGRAM_ADDRESS,
            })
            const transferIx = SPL.getTransferInstruction({
                amount,
                authority: payer,
                source: playerAta,
                destination: tokenAccount.address,
            })
            ixs.push(transferIx)
            tempAccount = tokenAccount
        }

        let [pda] = await getProgramDerivedAddress({
            programAddress: PROGRAM_ID,
            seeds: [getBase58Encoder().encode(gameAccountKey)],
        })

        const joinGameIx = instruction.join({
            playerKey: payer.address,
            profileKey,
            paymentKey: tempAccount.address,
            gameAccountKey,
            playersRegAccountKey: gameState.playersRegAccount,
            mint: mintKey,
            stakeAccountKey,
            recipientAccountKey: gameState.recipientAddr,
            amount,
            accessVersion,
            settleVersion,
            position,
            verifyKey,
            pda,
        })

        console.info('Transaction Instruction[Join]:', joinGameIx)
        ixs.push(joinGameIx)

        const tx = await makeTransaction(this.rpc(), payer, ixs)
        if ('err' in tx) {
            response.retryRequired(tx.err)
            return
        }

        const sig = await sendTransaction(payer, tx.ok, response, {
            commitment: 'confirmed',
            signers: [tempAccount],
        })
        if ('err' in sig) {
            return response.transactionFailed(sig.err)
        }

        const signature = sig.ok

        await confirmSignature(this.rpc(), signature, response, { signature })
    }

    async deposit(
        wallet: SolanaWalletAdapterWallet,
        params: DepositParams,
        response: ResponseHandle<DepositResponse, DepositError>
    ): Promise<void> {
        const payer = this.useTransactionSendingSigner(wallet)
        const gameAccountKey = address(params.gameAddr)
        // Call RPC functions in Parallel
        const [gameState, playerProfile] = await Promise.all([
            this._getGameState(gameAccountKey),
            this.getPlayerProfile(payer.address),
        ])

        if (gameState === undefined) {
            return response.failed('game-not-found')
        }
        let profileKey
        if (playerProfile === undefined) {
            return response.failed('profile-not-found')
        } else {
            profileKey = address(playerProfile.addr)
        }
        if (gameState.transactorKey === undefined) {
            return response.failed('game-not-served')
        }
        const settleVersion = gameState.settleVersion
        const mintKey = gameState.tokenKey
        const isWsol = mintKey == NATIVE_MINT
        const amount = BigInt(params.amount)
        if (gameState.entryType instanceof EntryTypeCash) {
            if (amount < gameState.entryType.minDeposit || amount > gameState.entryType.maxDeposit) {
                console.warn(
                    `Invalid deposit, maximum = ${gameState.entryType.maxDeposit}, minimum = ${gameState.entryType.minDeposit}, submitted = ${amount}`
                )
                return response.failed('invalid-deposit-amount')
            }
        } else if (gameState.entryType instanceof EntryTypeTicket) {
            if (amount !== gameState.entryType.amount) {
                console.warn(`Invalid deposit, ticket = ${gameState.entryType.amount}, submitted = ${amount}`)
                return response.failed('invalid-deposit-amount')
            }
        } else {
            return response.failed('unsupported-entry-type')
        }
        let ixs = []

        let tempAccount
        if (isWsol) {
            const account = await generateKeyPairSigner()

            const ix = getCreateAccountInstruction({
                payer,
                newAccount: account,
                lamports: amount,
                space: 0,
                programAddress: PROGRAM_ID,
            })
            ixs.push(ix)
            tempAccount = account
        } else {
            const { ixs: createTempAccountIxs, tokenAccount: tokenAccount } = await this._prepareCreateTokenAccount(
                payer,
                mintKey
            )
            ixs.push(...createTempAccountIxs)

            const [playerAta] = await SPL.findAssociatedTokenPda({
                owner: payer.address,
                mint: mintKey,
                tokenProgram: SPL.TOKEN_PROGRAM_ADDRESS,
            })
            const transferIx = SPL.getTransferInstruction({
                amount,
                authority: payer,
                source: playerAta,
                destination: tokenAccount.address,
            })

            ixs.push(transferIx)
            tempAccount = tokenAccount
        }

        const [pda, _] = await getProgramDerivedAddress({
            programAddress: PROGRAM_ID,
            seeds: [getBase58Encoder().encode(gameAccountKey)],
        })

        const depositGameIx = instruction.deposit({
            playerKey: payer.address,
            profileKey,
            paymentKey: tempAccount.address,
            gameAccountKey,
            playersRegAccountKey: gameState.playersRegAccount,
            mint: mintKey,
            stakeAccountKey: gameState.stakeKey,
            recipientAccountKey: gameState.recipientAddr,
            amount,
            settleVersion,
            pda,
        })
        console.info('Transaction Instruction[Deposit]:', depositGameIx)
        ixs.push(depositGameIx)
        const tx = await makeTransaction(this.rpc(), payer, ixs)
        if ('err' in tx) {
            return response.retryRequired(tx.err)
        }
        const sig = await sendTransaction(payer, tx.ok, response, {
            commitment: 'confirmed',
            signers: [tempAccount],
        })
        if ('err' in sig) {
            return response.transactionFailed(sig.err)
        }

        const signature = sig.ok

        await confirmSignature(this.rpc(), signature, response, { signature })
    }

    async attachBonus(
        wallet: SolanaWalletAdapterWallet,
        params: AttachBonusParams,
        response: ResponseHandle<AttachBonusResponse, AttachBonusError>
    ): Promise<void> {
        const payer = this.useTransactionSendingSigner(wallet)
        const gameAccountKey = address(params.gameAddr)
        const gameState = await this._getGameState(gameAccountKey)
        if (gameState === undefined) {
            return response.failed('game-not-found')
        }
        let ixs = []
        let tempAccountKeys = []
        let signers = []

        for (const bonus of params.bonuses) {
            const { tokenAddr, amount } = bonus
            const mintKey = address(tokenAddr)
            const mint = await SPL.fetchMint(this.rpc(), mintKey, {
                commitment: 'finalized',
            })
            const { ixs: createTempAccountIxs, tokenAccount: tokenAccount } = await this._prepareCreateTokenAccount(
                payer,
                mintKey
            )
            ixs.push(...createTempAccountIxs)
            const [playerAta] = await SPL.findAssociatedTokenPda({
                owner: payer.address,
                tokenProgram: SPL.TOKEN_PROGRAM_ADDRESS,
                mint: mintKey,
            })

            const transferIx = SPL.getTransferCheckedInstruction({
                source: playerAta,
                mint: mintKey,
                destination: tokenAccount.address,
                amount,
                decimals: mint.data.decimals,
                authority: payer.address,
            })

            ixs.push(transferIx)
            tempAccountKeys.push(tokenAccount.address)
            signers.push(tokenAccount)
        }

        const attachBonusIx = instruction.attachBonus({
            payerKey: payer.address,
            gameAccountKey: address(params.gameAddr),
            stakeAccountKey: gameState.stakeKey,
            identifiers: params.bonuses.map(b => b.identifier),
            tempAccountKeys,
        })

        if ('err' in attachBonusIx) {
            return response.failed(attachBonusIx.err)
        }
        console.info('Transaction Instruction[attachBonus]:', attachBonusIx.ok)
        ixs.push(attachBonusIx.ok)
        const tx = await makeTransaction(this.rpc(), payer, ixs)
        if ('err' in tx) {
            return response.retryRequired(tx.err)
        }
        const sig = await sendTransaction(payer, tx.ok, response, { signers })
        if ('err' in sig) {
            return response.transactionFailed(sig.err)
        }

        const signature = sig.ok

        await confirmSignature(this.rpc(), signature, response, { signature })
    }

    async vote(_payer: SolanaWalletAdapterWallet, _params: VoteParams): Promise<void> {
        throw new Error('unimplemented')
    }

    async recipientClaim(
        wallet: SolanaWalletAdapterWallet,
        params: RecipientClaimParams,
        response: ResponseHandle<RecipientClaimResponse, RecipientClaimError>
    ): Promise<void> {
        const payer = this.useTransactionSendingSigner(wallet)
        const recipientKey = address(params.recipientAddr)
        const recipientState = await this._getRecipientState(recipientKey)
        if (recipientState === undefined) {
            return response.failed('not-found')
        }

        const recipientClaimIx = await instruction.claim({
            recipientKey,
            payerKey: payer.address,
            recipientState,
        })
        if ('err' in recipientClaimIx) {
            return response.failed(recipientClaimIx.err)
        }
        const tx = await makeTransaction(this.rpc(), payer, [recipientClaimIx.ok])
        if ('err' in tx) {
            return response.retryRequired(tx.err)
        }
        const sig = await sendTransaction(payer, tx.ok, response)
        if ('err' in sig) {
            return response.transactionFailed(sig.err)
        }

        const signature = sig.ok

        await confirmSignature(this.rpc(), signature, response, {
            recipientAddr: params.recipientAddr,
            signature,
        })
    }

    async _getPlayerProfileAddress(payerKey: Address) {
        return await createAddressWithSeed({
            baseAddress: payerKey,
            programAddress: PROGRAM_ID,
            seed: PLAYER_PROFILE_SEED,
        })
    }

    async _getServerProfileAddress(serverKey: Address) {
        return await createAddressWithSeed({
            baseAddress: serverKey,
            programAddress: PROGRAM_ID,
            seed: SERVER_PROFILE_SEED,
        })
    }

    async _prepareCreatePlayerProfile(
        payer: TransactionSigner,
        params: CreatePlayerProfileParams
    ): Promise<Result<{ ixs: IInstruction[]; profileKey: Address }, CreatePlayerProfileError>> {
        let ixs = []
        const { nick, pfp } = params
        if (nick.length > 16) {
            return { err: 'invalid-nick' }
        }
        console.info('Payer Public Key:', payer.address)

        const profileKey = await this._getPlayerProfileAddress(payer.address)

        console.info('Player profile public key: ', profileKey)
        const profileAccountData = await this._getFinializedBase64AccountData(profileKey)

        if (!profileAccountData) {
            const lamports = await this.rpc().getMinimumBalanceForRentExemption(PROFILE_ACCOUNT_LEN).send()
            const ix = getCreateAccountWithSeedInstruction({
                baseAccount: payer,
                payer: payer,
                newAccount: profileKey,
                space: PROFILE_ACCOUNT_LEN,
                programAddress: PROGRAM_ID,
                seed: PLAYER_PROFILE_SEED,
                amount: lamports,
                base: payer.address,
            })
            console.info('Transaction Instruction[CreateAccount]:', ix)
            ixs.push(ix)
        }

        const pfpKey = !pfp ? address('11111111111111111111111111111111') : address(pfp)
        const createProfile = instruction.createPlayerProfile(payer.address, profileKey, nick, pfpKey)
        console.info('Transaction Instruction[CreatePlayerProfile]:', createProfile)
        ixs.push(createProfile)
        return {
            ok: {
                ixs,
                profileKey,
            },
        }
    }

    async createPlayerProfile(
        wallet: SolanaWalletAdapterWallet,
        params: CreatePlayerProfileParams,
        response: ResponseHandle<CreatePlayerProfileResponse, CreatePlayerProfileError>
    ): Promise<void> {
        const payer = this.useTransactionSendingSigner(wallet)
        let ixs: IInstruction[] = []
        const createPlayerProfile = await this._prepareCreatePlayerProfile(payer, params)
        if ('err' in createPlayerProfile) {
            return response.failed(createPlayerProfile.err)
        }
        const { ixs: createProfileIxs, profileKey } = createPlayerProfile.ok
        ixs.push(...createProfileIxs)
        let tx = await makeTransaction(this.rpc(), payer, ixs)
        if ('err' in tx) {
            return response.retryRequired(tx.err)
        }
        const sig = await sendTransaction(payer, tx.ok, response)
        if ('err' in sig) {
            return response.transactionFailed(sig.err)
        }

        const signature = sig.ok

        await confirmSignature(this.rpc(), signature, response, {
            signature,
            profile: {
                nick: params.nick,
                pfp: params.pfp,
                addr: profileKey,
            },
        })
    }

    async _prepareCreateTokenAccount(
        payer: TransactionSigner,
        mint: Address
    ): Promise<{ ixs: IInstruction[]; tokenAccount: KeyPairSigner }> {
        const token = await generateKeyPairSigner()
        const space = SPL.getTokenSize()
        const rent = await this.rpc().getMinimumBalanceForRentExemption(BigInt(space)).send()

        const ixs = [
            getCreateAccountInstruction({
                payer,
                newAccount: token,
                lamports: rent,
                space,
                programAddress: TOKEN_PROGRAM_ADDRESS,
            }),
            SPL.getInitializeAccountInstruction({
                account: token.address,
                mint,
                owner: payer.address,
            }),
        ]

        return {
            ixs,
            tokenAccount: token,
        }
    }
    async _prepareCreateAccountWithExtraRent(
        payer: TransactionSigner,
        size: bigint,
        extraRentSize: bigint,
        programAddress: Address
    ): Promise<{ ixs: IInstruction[]; account: KeyPairSigner }> {
        const account = await generateKeyPairSigner()
        const lamports = await this.rpc()
            .getMinimumBalanceForRentExemption(size + extraRentSize)
            .send()

        const ix = getCreateAccountInstruction({
            payer,
            newAccount: account,
            space: size,
            lamports,
            programAddress,
        })

        console.info('Transaction Instruction[CreateAccountWithExtraRent]:', ix)
        return { ixs: [ix], account }
    }
    async _prepareCreateAccount(
        payer: TransactionSigner,
        size: bigint,
        programAddress: Address
    ): Promise<{ ixs: IInstruction[]; account: KeyPairSigner }> {
        const account = await generateKeyPairSigner()
        const lamports = await this.rpc().getMinimumBalanceForRentExemption(size).send()

        const ix = getCreateAccountInstruction({
            payer,
            newAccount: account,
            space: size,
            lamports,
            programAddress,
        })

        console.info('Transaction Instruction[CreateAccount]:', ix)
        return { ixs: [ix], account }
    }

    async createRecipient(
        wallet: SolanaWalletAdapterWallet,
        params: CreateRecipientParams,
        response: ResponseHandle<CreateRecipientResponse, CreateRecipientError>
    ): Promise<void> {
        const payer = this.useTransactionSendingSigner(wallet)
        const createRecipientResult = await this._prepareCreateRecipient(payer, params)
        if ('err' in createRecipientResult) {
            return response.failed(createRecipientResult.err)
        }

        const { ixs, recipientAccount, signers } = createRecipientResult.ok

        const tx = await makeTransaction(this.rpc(), payer, ixs)
        if ('err' in tx) {
            return response.retryRequired(tx.err)
        }

        const signatureResult = await sendTransaction(payer, tx.ok, response, { signers })
        if ('err' in signatureResult) {
            return response.transactionFailed(signatureResult.err)
        }

        const signature = signatureResult.ok
        await confirmSignature(this.rpc(), signature, response, {
            recipientAddr: recipientAccount.address,
            signature,
        })
    }

    async addRecipientSlot(
        wallet: SolanaWalletAdapterWallet,
        params: AddRecipientSlotParams,
        response: ResponseHandle<AddRecipientSlotResponse, AddRecipientSlotError>
    ): Promise<void> {
        const payer = this.useTransactionSendingSigner(wallet)
        const { recipientAddr, slot } = params
        const recipientAccountKey = address(recipientAddr)

        const recipientState = await this._getRecipientState(recipientAccountKey)
        if (recipientState === undefined) {
            return response.failed('recipient-not-found')
        }

        if (recipientState.slots.some(s => s.id === slot.id)) {
            return response.failed('slot-id-exists')
        }

        let ixs: IInstruction[] = []
        let signers: KeyPairSigner[] = []
        const tokenMintKey = address(slot.tokenAddr)

        let stakeAddr: Address

        if (tokenMintKey == NATIVE_MINT) {
            ;[stakeAddr] = await getProgramDerivedAddress({
                programAddress: PROGRAM_ID,
                seeds: [getBase58Encoder().encode(recipientAccountKey), Uint8Array.of(slot.id)],
            })
        } else {
            const { ixs: createStakeAccountIxs, tokenAccount: stakeAccount } = await this._prepareCreateTokenAccount(
                payer,
                tokenMintKey
            )
            ixs.push(...createStakeAccountIxs)
            signers.push(stakeAccount)
            stakeAddr = stakeAccount.address
        }

        const initShares = slot.initShares.map(share => {
            let owner
            if ('addr' in share.owner) {
                owner = new RecipientSlotOwnerAssigned({ addr: address(share.owner.addr) })
            } else {
                owner = new RecipientSlotOwnerUnassigned({
                    identifier: share.owner.identifier,
                })
            }
            return new instruction.SlotShareInit({
                owner,
                weights: share.weights,
            })
        })

        const slotInit = new instruction.SlotInit({
            id: slot.id,
            tokenAddr: address(slot.tokenAddr),
            stakeAddr,
            slotType: slot.slotType === 'token' ? 0 : 1,
            initShares,
        })

        const addSlotIx = instruction.addRecipientSlot({
            payerKey: payer.address,
            recipientKey: recipientAccountKey,
            slot: slotInit,
        })
        ixs.push(addSlotIx)

        const tx = await makeTransaction(this.rpc(), payer, ixs)
        if ('err' in tx) {
            return response.retryRequired(tx.err)
        }

        const sig = await sendTransaction(payer, tx.ok, response, { signers })
        if ('err' in sig) {
            return response.transactionFailed(sig.err)
        }

        const signature = sig.ok

        await confirmSignature(this.rpc(), signature, response, {
            recipientAddr,
            signature,
        })
    }

    async _prepareCreateRecipient(
        payer: TransactionSendingSigner,
        params: CreateRecipientParams
    ): Promise<
        Result<
            {
                recipientAccount: KeyPairSigner
                ixs: IInstruction[]
                signers: KeyPairSigner[]
            },
            CreateRecipientError
        >
    > {
        if (params.slots.length > 10) {
            return { err: 'invalid-size' }
        }
        let ixs: IInstruction[] = []
        let signers: KeyPairSigner[] = []

        const capKey = params.capAddr ? address(params.capAddr) : payer.address

        const { ixs: createRecipientAccountIxs, account: recipientAccount } = await this._prepareCreateAccount(
            payer,
            RECIPIENT_ACCOUNT_LEN,
            PROGRAM_ID
        )
        ixs.push(...createRecipientAccountIxs)
        signers.push(recipientAccount)

        let usedId: number[] = []
        const transformedSlots: instruction.SlotInit[] = []

        for (const slot of params.slots) {
            if (usedId.includes(slot.id)) {
                return { err: 'duplicated-id' }
            }
            usedId.push(slot.id)

            const tokenMintKey = address(slot.tokenAddr)
            let stakeAddr: Address

            if (tokenMintKey == NATIVE_MINT) {
                ;[stakeAddr] = await getProgramDerivedAddress({
                    programAddress: PROGRAM_ID,
                    seeds: [getBase58Encoder().encode(recipientAccount.address), Uint8Array.of(slot.id)],
                })
            } else {
                const { ixs: createStakeAccountIxs, tokenAccount: stakeAccount } =
                    await this._prepareCreateTokenAccount(payer, tokenMintKey)
                ixs.push(...createStakeAccountIxs)
                signers.push(stakeAccount)
                stakeAddr = stakeAccount.address
            }

            const initShares = slot.initShares.map(share => {
                let owner
                if ('addr' in share.owner) {
                    owner = new RecipientSlotOwnerAssigned({ addr: address(share.owner.addr) })
                } else {
                    owner = new RecipientSlotOwnerUnassigned({
                        identifier: share.owner.identifier,
                    })
                }
                return new instruction.SlotShareInit({
                    owner,
                    weights: share.weights,
                })
            })

            const slotInit = new instruction.SlotInit({
                id: slot.id,
                tokenAddr: tokenMintKey,
                stakeAddr,
                slotType: slot.slotType === 'token' ? 0 : 1,
                initShares,
            })

            transformedSlots.push(slotInit)
        }

        const createRecipientIx = instruction.createRecipient({
            payerKey: payer.address,
            recipientKey: recipientAccount.address,
            slots: transformedSlots,
            capKey,
        })
        ixs.push(createRecipientIx)

        return {
            ok: {
                ixs,
                recipientAccount,
                signers,
            },
        }
    }
    async createRegistration(_payer: SolanaWalletAdapterWallet, _params: CreateRegistrationParams): Promise<void> {
        throw new Error('unimplemented')
    }
    async registerGame(_payer: SolanaWalletAdapterWallet, _params: RegisterGameParams): Promise<void> {
        throw new Error('unimplemented')
    }
    async unregisterGame(_payer: SolanaWalletAdapterWallet, _params: UnregisterGameParams): Promise<void> {
        throw new Error('unimplemented')
    }
    async getGameAccount(addr: string): Promise<GameAccount | undefined> {
        const gameAccountKey = address(addr)
        const gameState = await this._getGameState(gameAccountKey)
        if (gameState !== undefined) {
            const playersRegState = await this._getPlayersRegState(
                gameState.playersRegAccount,
                gameState.accessVersion,
                gameState.settleVersion
            )
            if (playersRegState === undefined) {
                console.warn('Players reg account not found')
                return undefined
            }

            return gameState.generalize(address(addr), playersRegState.players)
        } else {
            return undefined
        }
    }
    async getGameBundle(addr: string): Promise<GameBundle | undefined> {
        const mintKey = address(addr)
        const [metadataKey] = await getProgramDerivedAddress({
            programAddress: METAPLEX_PROGRAM_ID,
            seeds: ['metadata', getBase58Encoder().encode(METAPLEX_PROGRAM_ID), getBase58Encoder().encode(mintKey)],
        })

        const metadataAccountData = await this._getFinializedBase64AccountData(metadataKey)
        if (metadataAccountData === undefined) {
            return undefined
        }
        const metadataState = Metadata.deserialize(metadataAccountData)
        console.debug('Metadata of game bundle:', metadataState)
        let { uri, name } = metadataState.data
        // URI should contains the wasm property
        let resp = await fetch(trimString(uri))
        let json = await resp.json()
        let files: any[] = json['properties']['files']
        let wasm_file = files.find(f => f['type'] == 'application/wasm')
        return {
            addr,
            uri: wasm_file['uri'],
            name: trimString(name),
            data: new Uint8Array(0),
        }
    }
    async getPlayerProfile(addr: string): Promise<PlayerProfile | undefined> {
        const playerKey = address(addr)

        const profileKey = await this._getPlayerProfileAddress(playerKey)

        const profileAccountData = await this._getFinializedBase64AccountData(profileKey)

        if (profileAccountData !== undefined) {
            const state = PlayerState.deserialize(profileAccountData)
            return state.generalize(playerKey)
        } else {
            return undefined
        }
    }
    async listPlayerProfiles(addrs: string[]): Promise<Array<PlayerProfile | undefined>> {
        // We should truncate addresses by 100
        let results: Array<PlayerProfile | undefined> = []
        for (let i = 0; i < addrs.length; i += 100) {
            const addrsChunk = addrs.slice(i, i + 100).map(address)
            const keys = await Promise.all(addrsChunk.map(addr => this._getPlayerProfileAddress(addr)))
            const states = await this._getMultiPlayerStates(keys)
            results.push(...states.map((state, j) => state?.generalize(addrsChunk[j])))
        }
        return results
    }
    async getServerAccount(addr: string): Promise<ServerAccount | undefined> {
        const serverKey = address(addr)

        const profileKey = await this._getServerProfileAddress(serverKey)
        const serverState = await this._getServerState(profileKey)
        if (serverState !== undefined) {
            return serverState.generalize()
        } else {
            return undefined
        }
    }
    async getRegistration(addr: string): Promise<RegistrationAccount | undefined> {
        const regKey = address(addr)
        const regState = await this._getRegState(regKey)
        if (regState !== undefined) {
            return regState.generalize(regKey)
        } else {
            return undefined
        }
    }

    async listGameAccounts(addrs: string[]): Promise<GameAccount[]> {
        const keys = addrs.map(a => address(a))
        const gameStates = await this._getMultiGameStates(keys)
        const playersRegAccountKeys = gameStates
            .filter((s): s is GameState => s !== undefined)
            .map(s => s.playersRegAccount)
        const playersRegStates = await this._getMultiPlayersRegStates(playersRegAccountKeys)

        let games: Array<GameAccount> = []
        for (let i = 0; i < gameStates.length; i++) {
            const gs = gameStates[i]
            if (gs !== undefined) {
                let playersReg = playersRegStates.get(gs.playersRegAccount)
                if (playersReg !== undefined) {
                    games.push(gs.generalize(keys[i], playersReg.players))
                }
            }
        }
        return games
    }

    async getRecipient(addr: string): Promise<RecipientAccount | undefined> {
        const recipientKey = address(addr)
        const recipientState = await this._getRecipientState(recipientKey)
        if (recipientState === undefined) return undefined
        let slots: RecipientSlot[] = []
        for (const slot of recipientState.slots) {
            let balance
            if (slot.tokenAddr == NATIVE_MINT) {
                const resp = (await this.rpc().getAccountInfo(slot.stakeAddr).send()).value
                balance = BigInt(resp?.lamports || 0n)
            } else {
                const resp = await this.rpc().getTokenAccountBalance(slot.stakeAddr).send()
                balance = BigInt(resp.value.amount)
            }
            slots.push(slot.generalize(balance))
        }
        return recipientState.generalize(addr, slots)
    }

    async _fetchImageFromDataUri(dataUri: string): Promise<string | undefined> {
        try {
            const resp = await fetch(dataUri)
            const data = await resp.json()
            return data.image
        } catch (e) {
            return undefined
        }
    }

    async getTokenDecimals(addr: string): Promise<number | undefined> {
        const mintKey = address(addr)

        const mint = await SPL.fetchMint(this.rpc(), mintKey, {
            commitment: 'finalized',
        })

        return mint.data.decimals
    }

    async _getAssetAsToken(addr: Address): Promise<Token | undefined> {
        const assetResp = await this.dasRpc().getAsset(addr).send()
        if ('result' in assetResp) {
            const asset = assetResp.result
            const { name, symbol } = asset.content.metadata
            const icon = asset.content.files?.[0]?.uri
            if (icon == undefined) {
                console.warn('Skip token %s as its icon is not available', addr)
                console.warn('Token metadata:', asset.content.metadata)
                return undefined
            }
            const decimals = asset.token_info.decimals
            const token = {
                addr,
                name,
                symbol,
                icon,
                decimals,
            }
            return token
        } else {
            console.warn(assetResp.error, 'Error in getAsset response')
            return undefined
        }
    }

    async getToken(addr: string): Promise<Token | undefined> {
        const mintKey = address(addr)
        try {
            return await this._getAssetAsToken(mintKey)
        } catch (e) {
            console.warn(e)
            return undefined
        }
    }

    async listTokens(rawMintAddrs: string[]): Promise<Token[]> {
        // In Solana, token specification is stored in Mint, user token wallet is stored in Token.
        // Here we are querying the Mints.

        if (rawMintAddrs.length > 30) {
            throw new Error('Too many token addresses in a row')
        }

        let tokens = await Promise.all(rawMintAddrs.map(a => this._getAssetAsToken(address(a))))

        return tokens.filter((t): t is Token => t !== undefined)
    }

    async __fetchAllToken(walletAddr: Address, mintAddrs: Address[]): Promise<MaybeAccount<SPL.Token, string>[]> {
        const atas = await Promise.all(
            mintAddrs.map(mint =>
                SPL.findAssociatedTokenPda({
                    owner: walletAddr,
                    tokenProgram: SPL.TOKEN_PROGRAM_ADDRESS,
                    mint,
                })
            )
        )
        const tokens = SPL.fetchAllMaybeToken(
            this.rpc(),
            atas.map(([ata]) => ata)
        )
        return tokens
    }

    /**
     * List tokens.
     */
    async listTokenBalance(rawWalletAddr: string, rawMintAddrs: string[]): Promise<TokenBalance[]> {
        if (rawMintAddrs.length > 100) {
            throw new Error('Too many token addresses in a row')
        }
        const walletAddr = address(rawWalletAddr)
        const mintAddrs = rawMintAddrs.map(a => address(a))
        const rpc = this.rpc()

        const [getBalanceResp, getAllMaybeTokenResp] = await Promise.all([
            rpc.getBalance(walletAddr).send(),
            this.__fetchAllToken(walletAddr, mintAddrs),
        ])

        let result = []

        for (let i = 0; i < mintAddrs.length; i++) {
            const mintAddr = mintAddrs[i]
            const token = getAllMaybeTokenResp[i]
            if (mintAddr === NATIVE_MINT) {
                result.push({
                    addr: NATIVE_MINT,
                    amount: getBalanceResp.value,
                })
            } else if (token.exists) {
                result.push({
                    addr: mintAddr,
                    amount: token.data.amount,
                })
            } else {
                result.push({
                    addr: mintAddr,
                    amount: 0n,
                })
            }
        }

        return result
    }

    async getNft(addr: Address): Promise<Nft | undefined> {
        const resp = await this.dasRpc().getAsset(addr).send()

        if ('result' in resp) {
            const item = resp.result
            const collection = item.grouping.find(g => g.group_key === 'collection')?.group_value
            const image = item.content.links?.['image'] as string | undefined

            if (image !== undefined) {
                const nft: Nft = {
                    addr: item.id,
                    collection: collection,
                    image,
                    metadata: item.content.metadata,
                    name: item.content.metadata.name,
                    symbol: item.content.metadata.symbol,
                }
                return nft
            } else {
                console.warn('Ignore nft %s as not image found', item.id)
            }
        }
        return undefined
    }

    async listNfts(rawWalletAddr: string): Promise<Nft[]> {
        const walletAddr = address(rawWalletAddr)
        const resp = await this.dasRpc()
            .getAssetsByOwner({
                ownerAddress: walletAddr,
            })
            .send()
        let result: Nft[] = []

        if ('result' in resp) {
            const assetsResp = resp.result
            for (const item of assetsResp.items) {
                const collection = item.grouping.find(g => g.group_key === 'collection')?.group_value
                const image = item.content.links?.['image'] as string | undefined

                if (image !== undefined) {
                    const nft: Nft = {
                        addr: item.id,
                        collection: collection,
                        image,
                        metadata: item.content.metadata,
                        name: item.content.metadata.name,
                        symbol: item.content.metadata.symbol,
                    }
                    result.push(nft)
                } else {
                    console.warn('Ignore nft %s as not image found', item.id)
                }
            }
        }

        return result
    }

    async _getMultiGameStates(gameAccountKeys: Address[]): Promise<Array<GameState | undefined>> {
        const accounts = await this.rpc().getMultipleAccounts(gameAccountKeys).send()
        const ret: Array<GameState | undefined> = []
        for (let i = 0; i < accounts.value.length; i++) {
            const key = gameAccountKeys[i]
            const accountInfo = accounts.value[i]
            if (accountInfo !== null) {
                try {
                    ret.push(GameState.deserialize(base64ToUint8Array(accountInfo.data[0])))
                    console.debug('Found game account %s', key)
                } catch (_: any) {
                    ret.push(undefined)
                    console.warn('Skip invalid game account %s', key)
                }
            } else {
                ret.push(undefined)
                console.warn('Game account %s not exist', key)
            }
        }
        return ret
    }

    async _getMultiPlayersRegStates(
        playersRegAccountKeys: Address[]
    ): Promise<Map<Address, PlayersRegState | undefined>> {
        const accounts = await this.rpc().getMultipleAccounts(playersRegAccountKeys).send()

        const ret: Map<Address, PlayersRegState | undefined> = new Map()

        for (let i = 0; i < accounts.value.length; i++) {
            const key = playersRegAccountKeys[i]
            const accountInfo = accounts.value[i]
            if (accountInfo !== null) {
                try {
                    let state = PlayersRegState.deserialize(base64ToUint8Array(accountInfo.data[0]))
                    state.players = state.players.filter(p => p.accessVersion > 0n)
                    ret.set(key, state)
                    console.debug('Found game account %s', key)
                } catch (_: any) {
                    ret.set(key, undefined)
                    console.warn('Skip invalid game account %s', key)
                }
            } else {
                ret.set(key, undefined)
                console.warn('Game account %s not exist', key)
            }
        }
        return ret
    }

    async _getMultiPlayerStates(profileAccountKeys: Address[]): Promise<Array<PlayerState | undefined>> {
        const accounts = await this.rpc().getMultipleAccounts(profileAccountKeys).send()
        const ret: Array<PlayerState | undefined> = []
        for (let i = 0; i < accounts.value.length; i++) {
            const key = profileAccountKeys[i]
            const accountInfo = accounts.value[i]
            if (accountInfo !== null) {
                try {
                    ret.push(PlayerState.deserialize(base64ToUint8Array(accountInfo.data[0])))
                    console.info('Found player profile %s', key)
                } catch (_: any) {
                    ret.push(undefined)
                    console.warn('Skip invalid player profile %s', key)
                }
            } else {
                ret.push(undefined)
                console.warn('Player profile %s not exist', key)
            }
        }
        return ret
    }

    // This function returns the account data in Uint8Array which is parsed from base64 string
    // format.
    async _getFinializedBase64AccountData(addr: Address): Promise<Readonly<Uint8Array> | undefined> {
        const value = (await this.rpc().getAccountInfo(addr, { commitment: 'finalized', encoding: 'base64' }).send())
            .value
        if (value == null) {
            return undefined
        } else {
            return base64ToUint8Array(value.data[0])
        }
    }

    async _getGameState(gameAccountKey: Address): Promise<GameState | undefined> {
        const data = await this._getFinializedBase64AccountData(gameAccountKey)
        if (data !== undefined) {
            return GameState.deserialize(data)
        } else {
            return undefined
        }
    }

    async _getPlayersRegState(
        playersRegAccountKey: Address,
        accessVersion: bigint,
        settleVersion: bigint
    ): Promise<PlayersRegState | undefined> {
        let retries = 0
        while (retries < MAX_RETRIES_FOR_GET_PLAYERS_REG) {
            const data = await this._getFinializedBase64AccountData(playersRegAccountKey)
            if (data !== undefined) {
                let state = PlayersRegState.deserialize(data)
                if (state.accessVersion == accessVersion && state.settleVersion == settleVersion) {
                    state.players = state.players.filter(p => p.accessVersion > 0n)
                    return state
                } else {
                    retries += 1
                    continue
                }
            } else {
                return undefined
            }
        }
        return undefined
    }

    async _getRecipientState(recipientKey: Address): Promise<RecipientState | undefined> {
        const data = await this._getFinializedBase64AccountData(recipientKey)
        if (data !== undefined) {
            return RecipientState.deserialize(data)
        } else {
            return undefined
        }
    }

    async _getRegState(regKey: Address): Promise<RegistryState | undefined> {
        const data = await this._getFinializedBase64AccountData(regKey)
        if (data !== undefined) {
            return RegistryState.deserialize(data)
        } else {
            return undefined
        }
    }

    async _getServerState(serverKey: Address): Promise<ServerState | undefined> {
        const data = await this._getFinializedBase64AccountData(serverKey)
        if (data !== undefined) {
            return ServerState.deserialize(data)
        } else {
            return undefined
        }
    }

    async fixRecipientAddressTable(recipientAddr: Address): Promise<void> {
        const recipientState = this._getRecipientState(recipientAddr)

    }

    // port from https://github.com/anza-xyz/kit/blob/66808064e8251c452a4c339791b2985bf488e514/packages/react/src/useWalletAccountTransactionSendingSigner.ts
    useTransactionSendingSigner(wallet: SolanaWalletAdapterWallet): TransactionSendingSigner {
        return {
            address: address(wallet.accounts[0].address),
            signAndSendTransactions: async (
                transactions: readonly Transaction[],
                _config?: TransactionSendingSignerConfig
            ): Promise<readonly SignatureBytes[]> => {
                if (transactions.length == 0) {
                    throw new Error('Transactions are empty')
                }
                if (transactions.length > 1) {
                    throw new Error('Cannot sign multiple transactions')
                }
                const transactionEncoder = getTransactionEncoder()
                const [transaction] = transactions
                const wireTransactionBytes = transactionEncoder.encode(transaction)

                const resps = await wallet.features[SolanaSignAndSendTransaction].signAndSendTransaction({
                    transaction: new Uint8Array(wireTransactionBytes),
                    chain: this.#chain,
                    account: wallet.accounts[0],
                    options: {},
                })
                return resps.map((resp: any) => resp.signature)
            },
        }
    }
}

async function sendTransaction<T, E>(
    signer: TransactionSendingSigner,
    tx: TransactionMessageWithFeePayerAndBlockhashLifetime,
    response: ResponseHandle<T, E>,
    config?: SendTransactionOptions
): Promise<SendTransactionResult<Signature>> {
    response.waitingWallet()

    let transaction: Transaction = compileTransaction(tx)

    try {
        if (config?.signers !== undefined) {
            console.info('Signers: ', config?.signers)
            transaction = await partiallySignTransaction(
                config.signers.map(s => s.keyPair),
                transaction
            )
        }

        const signatures = await signer.signAndSendTransactions([transaction])

        console.log('Signatures:', signatures)

        const signature = getBase58Decoder().decode(signatures[0]) as Signature

        console.info(`Transaction signature: ${signature}`)

        response.confirming(signature)

        return { ok: signature }
    } catch (e: any) {
        console.error(e)
        response.userRejected(e.toString())
        return { err: e }
    }
}

async function confirmSignature<T, E>(
    rpc: Rpc<SolanaRpcApi>,
    signature: Signature,
    response: ResponseHandle<T, E>,
    data: T
) {
    let err: string = 'Unknown'

    for (let i = 0; ; i++) {
        await new Promise(r => setTimeout(r, 1000))

        const resp = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send()

        console.log('Signature response:', resp)

        if (resp.value.length === 0) {
            if (i === MAX_CONFIRM_TIMES) {
                err = 'Transaction signature status not found'
                break
            } else {
                continue
            }
        }

        const status = resp.value[0]

        if (status === null) {
            if (i === MAX_CONFIRM_TIMES) {
                err = 'Transaction signature status not found'
                break
            } else {
                continue
            }
        }

        if (status.err !== null) {
            if (i == MAX_CONFIRM_TIMES) {
                err = status.err.toString()
                break
            } else {
                continue
            }
        }

        if (status.confirmationStatus == null) {
            if (i == MAX_CONFIRM_TIMES) {
                err = 'Transaction confirmation status not found'
                break
            } else {
                continue
            }
        } else {
            return response.succeed(data)
        }
    }

    return response.transactionFailed(err)
}

async function makeTransaction(
    rpc: Rpc<SolanaRpcApi>,
    feePayer: TransactionSendingSigner,
    instructions: TransactionMessage['instructions'][number][]
): Promise<Result<TransactionMessageWithFeePayerAndBlockhashLifetime, string>> {
    const d = new Date()
    let latestBlockhash: Readonly<{
        blockhash: Blockhash
        lastValidBlockHeight: bigint
    }>
    try {
        latestBlockhash = (await rpc.getLatestBlockhash().send()).value
    } catch (e: any) {
        return { err: 'block-not-found' }
    }
    if (!latestBlockhash) {
        return { err: 'block-not-found' }
    }

    console.debug(
        'Got block hash %s, took %s milliseconds',
        latestBlockhash.blockhash,
        new Date().getTime() - d.getTime()
    )
    const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        tx => (
            console.info(feePayer, 'Setting the transaction fee payer'),
            setTransactionMessageFeePayer(feePayer.address, tx)
        ),
        tx => (
            console.info(latestBlockhash, 'Setting the transaction lifetime'),
            setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx)
        ),
        tx => (
            console.info(instructions, 'Setting the transaction instructions'),
            appendTransactionMessageInstructions(instructions, tx)
        )
    )

    console.info(transactionMessage, 'Transaction Message')
    return { ok: transactionMessage }
}

module tree_hurricane_markets::prediction_market {
    use std::type_name;
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::url::{Self, Url};

    const E_NOT_ADMIN: u64 = 1;
    const E_MARKET_CLOSED: u64 = 2;
    const E_MARKET_NOT_EXPIRED: u64 = 3;
    const E_MARKET_RESOLVED: u64 = 4;
    const E_INVALID_MARKET: u64 = 5;
    const E_INVALID_STAKE: u64 = 6;
    const E_WRONG_OUTCOME: u64 = 7;
    const E_NOT_RESOLVED: u64 = 8;
    const E_ALREADY_CLAIMED: u64 = 9;
    const E_NO_WINNING_STAKE: u64 = 10;
    const E_NFT_REQUIRED: u64 = 11;

    const NFTREE_TYPE_NO_PREFIX: vector<u8> =
        b"f6c6d439ea0da2f3e9ba79e4992a7a4c113215fbf54c442ac9020c315f953705::collection::NFT";

    public struct AdminCap has key, store {
        id: UID,
    }

    public struct ResolverCap has key, store {
        id: UID,
    }

    public struct Registry has key {
        id: UID,
        admin: address,
        markets: Table<ID, Market>,
        fee_bps: u64,
        required_nft_type: vector<u8>,
        impact_fund: Balance<SUI>,
    }

    public struct Market has store {
        question: vector<u8>,
        category: vector<u8>,
        resolution_source: Url,
        expiry_ms: u64,
        yes_pool: Balance<SUI>,
        no_pool: Balance<SUI>,
        resolved: bool,
        outcome_yes: bool,
        evidence_url: vector<u8>,
        evidence_hash: vector<u8>,
        source_timestamp_ms: u64,
    }

    public struct Position has key, store {
        id: UID,
        market_id: ID,
        owner: address,
        outcome_yes: bool,
        stake: u64,
        claimed: bool,
    }

    public struct MarketCreated has copy, drop {
        market_id: ID,
        expiry_ms: u64,
    }

    public struct PositionOpened has copy, drop {
        position_id: ID,
        market_id: ID,
        owner: address,
        outcome_yes: bool,
        stake: u64,
    }

    public struct MarketResolved has copy, drop {
        market_id: ID,
        outcome_yes: bool,
        evidence_url: vector<u8>,
        evidence_hash: vector<u8>,
        source_timestamp_ms: u64,
    }

    public struct PositionClaimed has copy, drop {
        position_id: ID,
        market_id: ID,
        owner: address,
        payout: u64,
    }

    fun init(ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);
        transfer::transfer(AdminCap { id: object::new(ctx) }, admin);
        transfer::transfer(ResolverCap { id: object::new(ctx) }, admin);
        transfer::share_object(Registry {
            id: object::new(ctx),
            admin,
            markets: table::new(ctx),
            fee_bps: 100,
            required_nft_type: NFTREE_TYPE_NO_PREFIX,
            impact_fund: balance::zero(),
        });
    }

    public fun is_authorized_nft<AccessNFT: key>(registry: &Registry): bool {
        let nft_type = type_name::with_original_ids<AccessNFT>();
        nft_type.as_string().as_bytes() == &registry.required_nft_type
    }

    public fun create_market(
        _: &AdminCap,
        registry: &mut Registry,
        question: vector<u8>,
        category: vector<u8>,
        resolution_source: vector<u8>,
        expiry_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, E_NOT_ADMIN);
        assert!(expiry_ms > clock::timestamp_ms(clock), E_MARKET_CLOSED);

        let market_key = object::new(ctx);
        let market_id = object::uid_to_inner(&market_key);
        object::delete(market_key);

        table::add(&mut registry.markets, market_id, Market {
            question,
            category,
            resolution_source: url::new_unsafe_from_bytes(resolution_source),
            expiry_ms,
            yes_pool: balance::zero(),
            no_pool: balance::zero(),
            resolved: false,
            outcome_yes: false,
            evidence_url: vector[],
            evidence_hash: vector[],
            source_timestamp_ms: 0,
        });

        event::emit(MarketCreated {
            market_id,
            expiry_ms,
        });
    }

    public fun buy_position<AccessNFT: key>(
        registry: &mut Registry,
        market_id: ID,
        outcome_yes: bool,
        _access_nft: &AccessNFT,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Position {
        assert!(is_authorized_nft<AccessNFT>(registry), E_NFT_REQUIRED);
        assert!(table::contains(&registry.markets, market_id), E_INVALID_MARKET);
        let stake_value = coin::value(&payment);
        assert!(stake_value > 0, E_INVALID_STAKE);

        let market = table::borrow_mut(&mut registry.markets, market_id);
        assert!(!market.resolved, E_MARKET_RESOLVED);
        assert!(clock::timestamp_ms(clock) < market.expiry_ms, E_MARKET_CLOSED);

        let mut stake = coin::into_balance(payment);
        let fee = balance::split(&mut stake, stake_value * registry.fee_bps / 10000);
        balance::join(&mut registry.impact_fund, fee);
        let net_stake = balance::value(&stake);

        if (outcome_yes) {
            balance::join(&mut market.yes_pool, stake);
        } else {
            balance::join(&mut market.no_pool, stake);
        };

        let position = Position {
            id: object::new(ctx),
            market_id,
            owner: tx_context::sender(ctx),
            outcome_yes,
            stake: net_stake,
            claimed: false,
        };
        let position_id = object::id(&position);

        event::emit(PositionOpened {
            position_id,
            market_id,
            owner: tx_context::sender(ctx),
            outcome_yes,
            stake: position.stake,
        });

        position
    }

    public fun resolve_market(
        _: &ResolverCap,
        registry: &mut Registry,
        market_id: ID,
        outcome_yes: bool,
        evidence_url: vector<u8>,
        evidence_hash: vector<u8>,
        source_timestamp_ms: u64,
        clock: &Clock,
    ) {
        assert!(table::contains(&registry.markets, market_id), E_INVALID_MARKET);

        let market = table::borrow_mut(&mut registry.markets, market_id);
        assert!(!market.resolved, E_MARKET_RESOLVED);
        assert!(clock::timestamp_ms(clock) >= market.expiry_ms, E_MARKET_NOT_EXPIRED);

        market.resolved = true;
        market.outcome_yes = outcome_yes;
        market.evidence_url = evidence_url;
        market.evidence_hash = evidence_hash;
        market.source_timestamp_ms = source_timestamp_ms;

        event::emit(MarketResolved { market_id, outcome_yes, evidence_url, evidence_hash, source_timestamp_ms });
    }

    public fun claim(
        registry: &mut Registry,
        position: &mut Position,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        assert!(position.owner == tx_context::sender(ctx), E_NOT_ADMIN);
        assert!(!position.claimed, E_ALREADY_CLAIMED);
        assert!(table::contains(&registry.markets, position.market_id), E_INVALID_MARKET);

        let market = table::borrow_mut(&mut registry.markets, position.market_id);
        assert!(market.resolved, E_NOT_RESOLVED);
        assert!(position.outcome_yes == market.outcome_yes, E_WRONG_OUTCOME);

        let winning_pool = if (market.outcome_yes) {
            balance::value(&market.yes_pool)
        } else {
            balance::value(&market.no_pool)
        };
        assert!(winning_pool > 0, E_NO_WINNING_STAKE);

        let losing_pool = if (market.outcome_yes) {
            balance::value(&market.no_pool)
        } else {
            balance::value(&market.yes_pool)
        };

        let stake_value = position.stake;
        let bonus = losing_pool * stake_value / winning_pool;

        let mut payout_balance = if (market.outcome_yes) {
            balance::split(&mut market.yes_pool, stake_value)
        } else {
            balance::split(&mut market.no_pool, stake_value)
        };
        let payout_bonus = if (market.outcome_yes) {
            balance::split(&mut market.no_pool, bonus)
        } else {
            balance::split(&mut market.yes_pool, bonus)
        };

        balance::join(&mut payout_balance, payout_bonus);
        let payout = balance::value(&payout_balance);
        position.claimed = true;

        event::emit(PositionClaimed {
            position_id: object::id(position),
            market_id: position.market_id,
            owner: tx_context::sender(ctx),
            payout,
        });

        coin::from_balance(payout_balance, ctx)
    }

    public fun withdraw_impact_fund(
        _: &AdminCap,
        registry: &mut Registry,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, E_NOT_ADMIN);
        let withdrawal = balance::split(&mut registry.impact_fund, amount);
        transfer::public_transfer(coin::from_balance(withdrawal, ctx), recipient);
    }

    public fun set_required_nft_type(
        _: &AdminCap,
        registry: &mut Registry,
        required_nft_type_no_prefix: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, E_NOT_ADMIN);
        registry.required_nft_type = required_nft_type_no_prefix;
    }
}

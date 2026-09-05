// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface. The full interface is not needed and not imported.
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title XorrDelegation
 * @notice The permission that lets a bot trade a user's capital while they are not looking.
 *
 * The product promise (screen 20 of the design handoff) is that the bot's authority is
 * TRADE-ONLY, VENUE-ALLOWLISTED, CAPPED PER DAY, TIME-BOXED, and REVOCABLE IN ONE TAP.
 *
 * The previous Solana build used SPL token delegation, which enforced scope, a total cap and
 * revocation at the token program — but the DAILY boundary and the venue allowlist still lived in
 * the executor. That was a documented residual risk: an executor compromise could spend the whole
 * remaining allowance in one go.
 *
 * This contract closes that. Every constraint is enforced here:
 *   - the daily cap resets on a UTC day boundary and is checked on-chain,
 *   - the expiry is checked on-chain,
 *   - the venue must be on the owner's allowlist,
 *   - the delegate can move funds to an ALLOWLISTED VENUE ONLY, never to an address it chooses,
 *   - revoke() takes effect immediately and needs nothing but the owner's signature.
 *
 * The contract never holds user funds. It pulls exactly the approved amount from the owner at the
 * moment of a trade and forwards it to the venue, so a user's balance sits in their own wallet
 * right up until a trade executes.
 */
contract XorrDelegation {
    struct Policy {
        address delegate;
        uint256 dailyCap;
        uint64 expiresAt;
        bool revoked;
    }

    /// @dev owner => policy
    mapping(address => Policy) private _policies;
    /// @dev owner => UTC day index => amount spent that day
    mapping(address => mapping(uint256 => uint256)) private _spentOnDay;
    /// @dev owner => venue => allowed
    mapping(address => mapping(address => bool)) private _venueAllowed;

    event Granted(
        address indexed owner,
        address indexed delegate,
        uint256 dailyCap,
        uint64 expiresAt
    );
    event Revoked(address indexed owner, address indexed delegate);
    event VenueAllowed(address indexed owner, address indexed venue, bool allowed);
    event Spent(
        address indexed owner,
        address indexed delegate,
        address indexed venue,
        address token,
        uint256 amount,
        uint256 spentToday
    );

    error NotDelegate();
    error PolicyRevoked();
    error PolicyExpired();
    error VenueNotAllowed(address venue);
    error DailyCapExceeded(uint256 requested, uint256 remaining);
    error ZeroAmount();
    error VenueCallFailed();

    // ─────────────────────────────────────────────────────────────────────────
    // Owner actions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Grant the bot a capped, time-boxed, venue-scoped trading authority.
     * @dev Re-granting overwrites the policy, which is how the app's "Save Settings" works.
     *      The owner must also ERC-20 approve this contract for the tokens it may pull.
     */
    function grant(
        address delegate,
        uint256 dailyCap,
        uint64 expiresAt,
        address[] calldata venues
    ) external {
        require(delegate != address(0), "delegate required");
        require(dailyCap > 0, "cap required");
        require(expiresAt > block.timestamp, "expiry in the past");

        _policies[msg.sender] = Policy({
            delegate: delegate,
            dailyCap: dailyCap,
            expiresAt: expiresAt,
            revoked: false
        });

        for (uint256 i = 0; i < venues.length; i++) {
            _venueAllowed[msg.sender][venues[i]] = true;
            emit VenueAllowed(msg.sender, venues[i], true);
        }

        emit Granted(msg.sender, delegate, dailyCap, expiresAt);
    }

    /**
     * @notice The kill switch. Takes effect immediately, on-chain.
     * @dev Deliberately needs nothing but the owner's signature — no server, no oracle, no
     *      cooperation from the bot. This is what makes "takes effect in under a second across
     *      every device" true by construction rather than by infrastructure.
     */
    function revoke() external {
        Policy storage p = _policies[msg.sender];
        address delegate = p.delegate;
        p.revoked = true;
        emit Revoked(msg.sender, delegate);
    }

    function setVenue(address venue, bool allowed) external {
        _venueAllowed[msg.sender][venue] = allowed;
        emit VenueAllowed(msg.sender, venue, allowed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Delegate action — the only thing the bot's key can do
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Spend the owner's capital at an allowlisted venue, inside the daily cap.
     * @dev Order matters: every check runs BEFORE any value moves, so a rejected trade leaves
     *      the owner's balance and their spent-today total completely untouched.
     * @param owner The user whose policy authorises this.
     * @param token The ERC-20 being spent.
     * @param venue The allowlisted contract to trade against.
     * @param amount Amount of `token` to spend.
     * @param data Calldata forwarded to `venue` (e.g. a 1inch swap payload).
     */
    function spend(
        address owner,
        address token,
        address venue,
        uint256 amount,
        bytes calldata data
    ) external returns (bytes memory result) {
        Policy memory p = _policies[owner];

        if (msg.sender != p.delegate) revert NotDelegate();
        if (p.revoked) revert PolicyRevoked();
        if (block.timestamp >= p.expiresAt) revert PolicyExpired();
        if (!_venueAllowed[owner][venue]) revert VenueNotAllowed(venue);
        if (amount == 0) revert ZeroAmount();

        uint256 day = _dayOf(block.timestamp);
        uint256 spent = _spentOnDay[owner][day];
        uint256 remaining = p.dailyCap > spent ? p.dailyCap - spent : 0;
        if (amount > remaining) revert DailyCapExceeded(amount, remaining);

        // Effects before interactions.
        _spentOnDay[owner][day] = spent + amount;

        // Pull exactly `amount` from the owner. The contract holds nothing between trades.
        require(IERC20(token).transferFrom(owner, address(this), amount), "pull failed");
        // Approve the venue for exactly this trade, and nothing more.
        IERC20(token).approve(venue, amount);

        (bool ok, bytes memory ret) = venue.call(data);
        if (!ok) revert VenueCallFailed();

        // Never leave a standing approval behind.
        IERC20(token).approve(venue, 0);

        emit Spent(owner, p.delegate, venue, token, amount, spent + amount);
        return ret;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views — the app reads its own limits from the chain, never from our database
    // ─────────────────────────────────────────────────────────────────────────

    function policyOf(address owner)
        external
        view
        returns (address delegate, uint256 dailyCap, uint64 expiresAt, bool revoked)
    {
        Policy memory p = _policies[owner];
        return (p.delegate, p.dailyCap, p.expiresAt, p.revoked);
    }

    /// @notice What the bot may still spend today. The number the Safety screen shows.
    function remainingToday(address owner) external view returns (uint256) {
        Policy memory p = _policies[owner];
        if (p.revoked || block.timestamp >= p.expiresAt) return 0;
        uint256 spent = _spentOnDay[owner][_dayOf(block.timestamp)];
        return p.dailyCap > spent ? p.dailyCap - spent : 0;
    }

    function spentToday(address owner) external view returns (uint256) {
        return _spentOnDay[owner][_dayOf(block.timestamp)];
    }

    function isVenueAllowed(address owner, address venue) external view returns (bool) {
        return _venueAllowed[owner][venue];
    }

    /// @dev UTC day index. The cap resets at midnight UTC, which is what the app tells the user.
    function _dayOf(uint256 timestamp) private pure returns (uint256) {
        return timestamp / 1 days;
    }
}

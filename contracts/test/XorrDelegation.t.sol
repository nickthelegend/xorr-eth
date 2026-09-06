// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XorrDelegation, IERC20} from "../src/XorrDelegation.sol";

/// @dev Minimal ERC-20 for the tests. Real token semantics, no dependency.
contract MockUSDC {
    string public name = "Test USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Stands in for a DEX router: takes the token it was approved for.
contract MockVenue {
    MockUSDC public token;
    uint256 public received;

    constructor(MockUSDC t) {
        token = t;
    }

    function swap(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        received += amount;
    }
}

contract XorrDelegationTest is Test {
    XorrDelegation internal del;
    MockUSDC internal usdc;
    /// A non-settlement asset, so a close can be tested for what it is: selling a holding.
    MockUSDC internal asset;
    MockVenue internal venue;
    /// A venue that trades the non-settlement asset, so a close has somewhere real to sell into.
    MockVenue internal assetVenue;
    MockVenue internal unlistedVenue;

    address internal owner = address(0xA11CE);
    address internal bot = address(0xB0B);
    address internal attacker = address(0xBAD);

    uint256 internal constant USD = 1e6;
    uint256 internal constant DAILY_CAP = 400 * USD;

    function setUp() public {
        del = new XorrDelegation();
        usdc = new MockUSDC();
        asset = new MockUSDC();
        venue = new MockVenue(usdc);
        unlistedVenue = new MockVenue(usdc);

        usdc.mint(owner, 10_000 * USD);

        address[] memory venues = new address[](1);
        venues[0] = address(venue);

        vm.startPrank(owner);
        // The owner approves the delegation contract to pull, and grants the policy.
        usdc.approve(address(del), type(uint256).max);
        del.grant(bot, DAILY_CAP, uint64(block.timestamp + 3 days), venues);
        // The close tests sell `asset`, which needs a venue that can actually take it.
        assetVenue = new MockVenue(asset);
        del.setVenue(address(assetVenue), true);
        vm.stopPrank();
    }

    // ── The grant ────────────────────────────────────────────────────────────

    function test_GrantStoresThePolicy() public view {
        (address delegate, uint256 cap, uint64 expiresAt, bool revoked) = del.policyOf(owner);
        assertEq(delegate, bot);
        assertEq(cap, DAILY_CAP);
        assertGt(expiresAt, block.timestamp);
        assertFalse(revoked);
        assertEq(del.remainingToday(owner), DAILY_CAP);
    }

    // ── The bot can trade inside the cap ─────────────────────────────────────

    function test_BotCanSpendInsideTheCap() public {
        vm.prank(bot);
        del.spend(owner, address(usdc), address(venue), 100 * USD, _swapCall(100 * USD));

        assertEq(venue.received(), 100 * USD);
        assertEq(del.spentToday(owner), 100 * USD);
        assertEq(del.remainingToday(owner), 300 * USD);
        assertEq(usdc.balanceOf(owner), 9_900 * USD);
    }

    function test_SeveralTradesAccumulateAgainstTheCap() public {
        vm.startPrank(bot);
        del.spend(owner, address(usdc), address(venue), 150 * USD, _swapCall(150 * USD));
        del.spend(owner, address(usdc), address(venue), 150 * USD, _swapCall(150 * USD));
        vm.stopPrank();
        assertEq(del.spentToday(owner), 300 * USD);
        assertEq(del.remainingToday(owner), 100 * USD);
    }

    // ── THE DAILY CAP IS ENFORCED BY THIS CONTRACT ───────────────────────────

    function test_SpendOverTheDailyCapReverts() public {
        vm.prank(bot);
        del.spend(owner, address(usdc), address(venue), 350 * USD, _swapCall(350 * USD));

        // 50 left. Asking for 51 must fail.
        vm.prank(bot);
        vm.expectRevert(
            abi.encodeWithSelector(XorrDelegation.DailyCapExceeded.selector, 51 * USD, 50 * USD)
        );
        del.spend(owner, address(usdc), address(venue), 51 * USD, _swapCall(51 * USD));

        // And nothing moved.
        assertEq(del.spentToday(owner), 350 * USD);
        assertEq(usdc.balanceOf(owner), 9_650 * USD);
    }

    /// @notice The improvement over the Solana build: the cap RESETS on the UTC day boundary,
    ///         on-chain, rather than being tracked by the executor.
    function test_TheCapResetsTheNextDay() public {
        vm.prank(bot);
        del.spend(owner, address(usdc), address(venue), DAILY_CAP, _swapCall(DAILY_CAP));
        assertEq(del.remainingToday(owner), 0);

        vm.warp(block.timestamp + 1 days);
        assertEq(del.remainingToday(owner), DAILY_CAP);
        assertEq(del.spentToday(owner), 0);

        vm.prank(bot);
        del.spend(owner, address(usdc), address(venue), 10 * USD, _swapCall(10 * USD));
        assertEq(del.spentToday(owner), 10 * USD);
    }

    // ── Venue allowlist ──────────────────────────────────────────────────────

    function test_TheBotCannotTradeAtAnUnlistedVenue() public {
        vm.prank(bot);
        vm.expectRevert(
            abi.encodeWithSelector(XorrDelegation.VenueNotAllowed.selector, address(unlistedVenue))
        );
        del.spend(owner, address(usdc), address(unlistedVenue), 10 * USD, _swapCall(10 * USD));
        assertEq(usdc.balanceOf(owner), 10_000 * USD);
    }

    /// @notice This is the "it cannot move your money out" promise on the delegation screen.
    function test_TheBotCannotSendFundsToAnAddressItChooses() public {
        // An EOA the bot controls is not an allowlisted venue, so there is no path to it.
        vm.prank(bot);
        vm.expectRevert(
            abi.encodeWithSelector(XorrDelegation.VenueNotAllowed.selector, attacker)
        );
        del.spend(owner, address(usdc), attacker, 10 * USD, "");
        assertEq(usdc.balanceOf(attacker), 0);
    }

    // ── Who may call ─────────────────────────────────────────────────────────

    function test_OnlyTheDelegateCanSpend() public {
        vm.prank(attacker);
        vm.expectRevert(XorrDelegation.NotDelegate.selector);
        del.spend(owner, address(usdc), address(venue), 10 * USD, _swapCall(10 * USD));
    }

    // ── Expiry — screen 4's "Run For" is a real deadline ─────────────────────

    function test_SpendAfterExpiryReverts() public {
        vm.warp(block.timestamp + 4 days);
        vm.prank(bot);
        vm.expectRevert(XorrDelegation.PolicyExpired.selector);
        del.spend(owner, address(usdc), address(venue), 10 * USD, _swapCall(10 * USD));
        assertEq(del.remainingToday(owner), 0);
    }

    // ── The kill switch ──────────────────────────────────────────────────────

    function test_RevokeStopsTheBotImmediately() public {
        vm.prank(owner);
        del.revoke();

        vm.prank(bot);
        vm.expectRevert(XorrDelegation.PolicyRevoked.selector);
        del.spend(owner, address(usdc), address(venue), 1 * USD, _swapCall(1 * USD));
    }

    /// @notice Screen 20 promises the funds are untouched when you stop the agents.
    function test_RevokeDoesNotTouchTheBalance() public {
        vm.prank(bot);
        del.spend(owner, address(usdc), address(venue), 100 * USD, _swapCall(100 * USD));
        uint256 before = usdc.balanceOf(owner);

        vm.prank(owner);
        del.revoke();

        assertEq(usdc.balanceOf(owner), before);
        assertEq(del.remainingToday(owner), 0);
    }

    function test_OnlyTheOwnerCanRevokeTheirOwnPolicy() public {
        // An attacker calling revoke() only revokes THEIR policy, never the owner's.
        vm.prank(attacker);
        del.revoke();

        (, , , bool revoked) = del.policyOf(owner);
        assertFalse(revoked);

        vm.prank(bot);
        del.spend(owner, address(usdc), address(venue), 1 * USD, _swapCall(1 * USD));
        assertEq(venue.received(), 1 * USD);
    }

    // ── No standing approvals ────────────────────────────────────────────────

    function test_NoApprovalIsLeftBehindAfterATrade() public {
        vm.prank(bot);
        del.spend(owner, address(usdc), address(venue), 100 * USD, _swapCall(100 * USD));
        assertEq(usdc.allowance(address(del), address(venue)), 0);
        // And the contract custodies nothing between trades.
        assertEq(usdc.balanceOf(address(del)), 0);
    }

    // ── Fuzz: the cap can never be exceeded, for any amount ──────────────────

    function testFuzz_TheCapIsNeverExceeded(uint256 amount) public {
        amount = bound(amount, 1, 10_000 * USD);
        vm.prank(bot);
        if (amount > DAILY_CAP) {
            vm.expectRevert();
            del.spend(owner, address(usdc), address(venue), amount, _swapCall(amount));
            assertEq(del.spentToday(owner), 0);
        } else {
            del.spend(owner, address(usdc), address(venue), amount, _swapCall(amount));
            assertLe(del.spentToday(owner), DAILY_CAP);
        }
    }

    function _swapCall(uint256 amount) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(MockVenue.swap.selector, amount);
    }

    // ── Closing is separately authorised, and separately bounded ────────────

    function test_CloseSellsWithoutTouchingTheDailyCap() public {
        // A stop that a spending limit can silence is not a stop. Use the cap up first, then
        // close: the close must still work.
        vm.prank(bot);
        del.spend(owner, address(usdc), address(venue), DAILY_CAP, _swapCall(DAILY_CAP));
        assertEq(del.remainingToday(owner), 0, "cap should be exhausted");

        asset.mint(owner, 1e18);
        vm.prank(owner);
        asset.approve(address(del), type(uint256).max);

        vm.prank(bot);
        del.closePosition(owner, address(asset), address(assetVenue), 1e18, _swapCall(1e18));

        assertEq(asset.balanceOf(owner), 0, "the asset was not sold");
        // Still zero, not negative and not reset: closing is not spending.
        assertEq(del.remainingToday(owner), 0, "closing moved the spend cap");
    }

    function test_CloseObeysTheVenueAllowlist() public {
        asset.mint(owner, 1e18);
        vm.prank(owner);
        asset.approve(address(del), type(uint256).max);

        vm.prank(bot);
        vm.expectRevert(abi.encodeWithSelector(XorrDelegation.VenueNotAllowed.selector, address(0xBAD)));
        del.closePosition(owner, address(asset), address(0xBAD), 1e18, "");
    }

    function test_CloseStopsWhenRevoked() public {
        asset.mint(owner, 1e18);
        vm.startPrank(owner);
        asset.approve(address(del), type(uint256).max);
        del.revoke();
        vm.stopPrank();

        vm.prank(bot);
        vm.expectRevert(XorrDelegation.PolicyRevoked.selector);
        del.closePosition(owner, address(asset), address(assetVenue), 1e18, _swapCall(1e18));
    }

    function test_OnlyTheDelegateCanClose() public {
        asset.mint(owner, 1e18);
        vm.prank(owner);
        asset.approve(address(del), type(uint256).max);

        vm.prank(address(0xC0FFEE));
        vm.expectRevert(XorrDelegation.NotDelegate.selector);
        del.closePosition(owner, address(asset), address(assetVenue), 1e18, _swapCall(1e18));
    }

    function test_CloseLeavesNoStandingApproval() public {
        asset.mint(owner, 1e18);
        vm.prank(owner);
        asset.approve(address(del), type(uint256).max);

        vm.prank(bot);
        del.closePosition(owner, address(asset), address(assetVenue), 1e18, _swapCall(1e18));
        assertEq(asset.allowance(address(del), address(assetVenue)), 0, "approval left behind");
    }
}

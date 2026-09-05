// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { IAqua } from "aqua/src/interfaces/IAqua.sol";
import { XorrAquaBook } from "../src/XorrAquaBook.sol";
import { XorrDelegation } from "../src/XorrDelegation.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

/**
 * Fork tests against the REAL Aqua protocol on Base mainnet.
 *
 * The 1inch prize requires official Aqua contracts and on-chain token movement; local forks are
 * explicitly allowed. Every assertion below runs against Aqua at 0x1111113ccf… with real Base
 * state, real USDC, and real balances.
 *
 * Run: forge test --match-contract XorrAquaBookFork --fork-url https://mainnet.base.org
 */
contract XorrAquaBookForkTest is Test {
    /// @dev Official Aqua deployment. Same address on every chain it ships to.
    IAqua constant AQUA = IAqua(0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a);
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    XorrAquaBook internal book;
    XorrDelegation internal delegation;

    address internal maker = makeAddr("maker");
    address internal bot = makeAddr("bot");
    address internal taker = makeAddr("taker");
    address internal attacker = makeAddr("attacker");

    uint256 constant USD = 1e6;
    uint256 constant SEED_USDC = 20_000 * USD;
    uint256 constant SEED_WETH = 5 ether;

    XorrAquaBook.Strategy internal strat;

    function setUp() public {
        // Real Base state. Pinned via FORK_BLOCK when set, so a demo is reproducible.
        uint256 pin = vm.envOr("FORK_BLOCK", uint256(0));
        if (pin == 0) vm.createSelectFork(vm.envOr("BASE_RPC", string("https://mainnet.base.org")));
        else vm.createSelectFork(vm.envOr("BASE_RPC", string("https://mainnet.base.org")), pin);

        // Aqua really is deployed here — the whole test rests on it.
        assertGt(address(AQUA).code.length, 0, "Aqua not deployed on this fork");

        delegation = new XorrDelegation();
        book = new XorrAquaBook(AQUA, delegation);

        deal(USDC, maker, SEED_USDC);
        deal(WETH, maker, SEED_WETH);
        deal(USDC, taker, 10_000 * USD);
        deal(WETH, taker, 10 ether);

        // The maker's ONE approval. Tokens stay in their wallet.
        vm.startPrank(maker);
        IERC20(USDC).approve(address(AQUA), type(uint256).max);
        IERC20(WETH).approve(address(AQUA), type(uint256).max);

        address[] memory venues = new address[](1);
        venues[0] = address(book);
        delegation.grant(bot, 5_000 * USD, uint64(block.timestamp + 7 days), venues);
        vm.stopPrank();

        // WETH per USDC is tiny, so express the book as token0=WETH, token1=USDC.
        strat = XorrAquaBook.Strategy({
            maker: maker,
            token0: WETH,
            token1: USDC,
            feeBps: 30,
            maxDeviationBps: 500, // 5%
            // Raw-unit form: 4000 USDC(6dp) per 1 WETH(18dp) -> 4000e6/1e18*1e18 = 4e9.
            referencePrice: 4e9,
            salt: keccak256("xorr/WETH-USDC/v1")
        });
    }

    /// @dev The MAKER ships. Aqua records the strategy against msg.sender, so nobody — not the
    ///      bot, not us — can open a book in a user's name. The bot computes the terms via
    ///      `shipArgs()`; the user signs the transaction.
    function _ship() internal returns (bytes32) {
        (address app, bytes memory encoded, address[] memory tokens, uint256[] memory amounts) =
            book.shipArgs(strat, SEED_WETH, SEED_USDC);
        vm.prank(maker);
        return AQUA.ship(app, encoded, tokens, amounts);
    }

    function _dock() internal {
        (address app, bytes32 hash, address[] memory tokens) = book.dockArgs(strat);
        vm.prank(maker);
        AQUA.dock(app, hash, tokens);
    }

    // ── The core claim: capital never leaves the maker's wallet ──────────────

    function test_ShipMovesNoTokens() public {
        uint256 usdcBefore = IERC20(USDC).balanceOf(maker);
        uint256 wethBefore = IERC20(WETH).balanceOf(maker);

        bytes32 hash = _ship();

        // This is Aqua's whole point, and xorr's: the book exists, the tokens did not move.
        assertEq(IERC20(USDC).balanceOf(maker), usdcBefore, "USDC left the wallet");
        assertEq(IERC20(WETH).balanceOf(maker), wethBefore, "WETH left the wallet");
        assertEq(IERC20(USDC).balanceOf(address(book)), 0, "app custodied USDC");
        assertEq(IERC20(USDC).balanceOf(address(AQUA)), 0, "Aqua custodied USDC");

        (uint256 b0, uint256 b1) = book.bookBalances(strat);
        assertEq(b0, SEED_WETH);
        assertEq(b1, SEED_USDC);
        assertTrue(hash != bytes32(0));
    }

    // ── A real swap moves real tokens ───────────────────────────────────────

    function test_TakerSwapMovesRealTokens() public {
        _ship();

        uint256 amountIn = 200 * USD; // inside the 5% band on a 20k book
        uint256 expected = book.quoteExactIn(strat, false, amountIn);
        assertGt(expected, 0);

        uint256 takerWethBefore = IERC20(WETH).balanceOf(taker);
        uint256 makerUsdcBefore = IERC20(USDC).balanceOf(maker);

        vm.startPrank(taker);
        IERC20(USDC).approve(address(book), amountIn);
        uint256 out = book.swapExactIn(strat, false, amountIn, expected, taker);
        vm.stopPrank();

        assertEq(out, expected, "quote and fill disagree");
        // Real ERC-20 movement, which is what the prize asks to see.
        assertEq(IERC20(WETH).balanceOf(taker), takerWethBefore + out, "taker did not receive WETH");
        assertEq(IERC20(USDC).balanceOf(maker), makerUsdcBefore + amountIn, "maker did not receive USDC");

        (uint256 b0, uint256 b1) = book.bookBalances(strat);
        assertEq(b0, SEED_WETH - out, "virtual WETH not debited");
        assertEq(b1, SEED_USDC + amountIn, "virtual USDC not credited");
    }

    function test_MakerEarnsTheSpread() public {
        _ship();
        // Round trip: buy WETH then sell it back. The maker should end with more value.
        uint256 usdcIn = 500 * USD;

        vm.startPrank(taker);
        IERC20(USDC).approve(address(book), usdcIn);
        uint256 wethOut = book.swapExactIn(strat, false, usdcIn, 0, taker);

        IERC20(WETH).approve(address(book), wethOut);
        uint256 usdcBack = book.swapExactIn(strat, true, wethOut, 0, taker);
        vm.stopPrank();

        // The taker pays the fee twice, so they get back less than they put in.
        assertLt(usdcBack, usdcIn, "taker round-tripped for free");
        (, uint256 b1) = book.bookBalances(strat);
        assertGt(b1, SEED_USDC, "maker did not keep the spread");
    }

    // ── The oracle band: the line that protects a 24/7 book on a 24/5 asset ──

    function test_QuoteOutsideTheBandReverts() public {
        _ship();
        // A trade large enough to push the executed price >5% from the reference.
        uint256 huge = 8_000 * USD;
        vm.expectRevert();
        book.quoteExactIn(strat, false, huge);
    }

    /// @notice The band binds the SWAP too, not just the quote — a taker cannot route around it.
    function test_SwapOutsideTheBandReverts() public {
        _ship();
        uint256 tooBig = 1_000 * USD;
        vm.startPrank(taker);
        IERC20(USDC).approve(address(book), tooBig);
        vm.expectRevert();
        book.swapExactIn(strat, false, tooBig, 0, taker);
        vm.stopPrank();
        // Nothing moved.
        (uint256 b0,) = book.bookBalances(strat);
        assertEq(b0, SEED_WETH);
    }

    function test_InsideTheBandIsFine() public {
        _ship();
        uint256 small = 100 * USD;
        assertGt(book.quoteExactIn(strat, false, small), 0);
    }

    // ── Authority: nobody can open or move a book in a user's name ──────────

    /**
     * Aqua keys every strategy to `msg.sender`, so an operator physically cannot ship for someone
     * else. A book opened by an attacker belongs to the attacker and holds their capital, not the
     * victim's — which is the structural version of the guarantee, stronger than a check we write.
     */
    function test_AnAttackerShippingOnlyEverOpensTheirOwnBook() public {
        XorrAquaBook.Strategy memory evil = strat;
        evil.maker = maker; // claims to be the victim's book

        (address app, bytes memory encoded, address[] memory tokens, uint256[] memory amounts) =
            book.shipArgs(evil, SEED_WETH, SEED_USDC);

        deal(WETH, attacker, SEED_WETH);
        deal(USDC, attacker, SEED_USDC);
        vm.startPrank(attacker);
        IERC20(WETH).approve(address(AQUA), type(uint256).max);
        IERC20(USDC).approve(address(AQUA), type(uint256).max);
        AQUA.ship(app, encoded, tokens, amounts);
        vm.stopPrank();

        // Aqua credited the ATTACKER, not the victim. The victim has no book and no exposure.
        (uint256 v0, uint256 v1) = book.bookBalances(evil);
        assertEq(v0, 0, "victim was credited a book they never opened");
        assertEq(v1, 0);
        assertFalse(book.isOpen(evil));

        // The attacker's book exists — under the ATTACKER's slot, backed by the attacker's own
        // capital. Read Aqua directly, because the strategy hash still names the victim while the
        // balance sits with msg.sender. That gap is precisely the protection.
        (uint248 attackerBal,) =
            AQUA.rawBalances(attacker, address(book), keccak256(encoded), WETH);
        assertEq(uint256(attackerBal), SEED_WETH, "attacker funded their own book");
    }

    // ── The delegate-taker path: where Aqua and XorrDelegation compose ──────

    function test_BotCanTakeWithItsPrincipalsCapital() public {
        _ship();
        address principal = taker;
        deal(USDC, principal, 5_000 * USD);

        address[] memory venues = new address[](1);
        venues[0] = address(book);
        vm.startPrank(principal);
        delegation.grant(bot, 5_000 * USD, uint64(block.timestamp + 1 days), venues);
        IERC20(USDC).approve(address(book), type(uint256).max);
        vm.stopPrank();

        uint256 before = IERC20(WETH).balanceOf(principal);
        vm.prank(bot);
        uint256 out = book.swapAsDelegate(strat, principal, false, 200 * USD, 0);

        assertGt(out, 0);
        // The bot never touches either leg — the principal funds it and receives it.
        assertEq(IERC20(WETH).balanceOf(principal), before + out);
        assertEq(IERC20(WETH).balanceOf(bot), 0);
        assertEq(IERC20(USDC).balanceOf(bot), 0);
    }

    function test_BotCannotTakeForSomeoneWhoDidNotDelegate() public {
        _ship();
        vm.prank(bot);
        vm.expectRevert(
            abi.encodeWithSelector(XorrAquaBook.NotAuthorisedOperator.selector, bot, attacker)
        );
        book.swapAsDelegate(strat, attacker, false, 100 * USD, 0);
    }

    function test_BotCannotTakeAfterItsPrincipalRevokes() public {
        _ship();
        address principal = taker;
        deal(USDC, principal, 5_000 * USD);

        address[] memory venues = new address[](1);
        venues[0] = address(book);
        vm.startPrank(principal);
        delegation.grant(bot, 5_000 * USD, uint64(block.timestamp + 1 days), venues);
        IERC20(USDC).approve(address(book), type(uint256).max);
        delegation.revoke();
        vm.stopPrank();

        vm.prank(bot);
        vm.expectRevert(
            abi.encodeWithSelector(XorrAquaBook.NotAuthorisedOperator.selector, bot, principal)
        );
        book.swapAsDelegate(strat, principal, false, 100 * USD, 0);
    }

    // ── Exit: the maker never needs us ──────────────────────────────────────

    function test_MakerCanDockWithoutTheBot() public {
        _ship();
        _dock();

        (uint256 b0, uint256 b1) = book.bookBalances(strat);
        assertEq(b0, 0);
        assertEq(b1, 0);
        assertFalse(book.isOpen(strat), "book still open after dock");
        // And their tokens were never anywhere else to begin with.
        assertEq(IERC20(USDC).balanceOf(maker), SEED_USDC);
        assertEq(IERC20(WETH).balanceOf(maker), SEED_WETH);
    }

    function test_MakerCanDockEvenAfterRevokingTheBot() public {
        _ship();
        vm.prank(maker);
        delegation.revoke();
        _dock(); // must still work with no operator involved at all

        (uint256 b0,) = book.bookBalances(strat);
        assertEq(b0, 0);
        assertFalse(book.isOpen(strat));
    }

    function test_SwapOnDockedBookReverts() public {
        _ship();
        _dock();

        vm.startPrank(taker);
        IERC20(USDC).approve(address(book), 100 * USD);
        // Aqua itself refuses a docked strategy, before our own EmptyBook guard is reached.
        vm.expectRevert();
        book.swapExactIn(strat, false, 100 * USD, 0, taker);
        vm.stopPrank();
    }

    // ── Slippage ────────────────────────────────────────────────────────────

    function test_SlippageGuardReverts() public {
        _ship();
        uint256 amountIn = 500 * USD;
        uint256 quoted = book.quoteExactIn(strat, false, amountIn);

        vm.startPrank(taker);
        IERC20(USDC).approve(address(book), amountIn);
        vm.expectRevert(
            abi.encodeWithSelector(XorrAquaBook.InsufficientOutputAmount.selector, quoted, quoted + 1)
        );
        book.swapExactIn(strat, false, amountIn, quoted + 1, taker);
        vm.stopPrank();
    }
}

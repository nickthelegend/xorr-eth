// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {XorrDelegation} from "../src/XorrDelegation.sol";

/// @notice Deploys XorrDelegation. Target chain comes from --rpc-url.
contract Deploy is Script {
    function run() external returns (XorrDelegation delegation) {
        vm.startBroadcast();
        delegation = new XorrDelegation();
        vm.stopBroadcast();
        console.log("XorrDelegation deployed to:", address(delegation));
    }
}

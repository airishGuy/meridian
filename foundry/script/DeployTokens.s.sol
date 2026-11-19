// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/MockERC20.sol";

contract DeployTokens is Script {
    function run() external {
        address mintTo = vm.envAddress("ADDRESS_TO_MINT_TO");
        uint256 supply = 10_000_000_000;

        vm.startBroadcast();

        MockERC20 tokenA = new MockERC20("tLTC",     "tLTC", 18, supply * 10 ** 18, mintTo);
        MockERC20 tokenB = new MockERC20("STPT",     "STPT", 18, supply * 10 ** 18, mintTo);
        MockERC20 tokenC = new MockERC20("GENOME",     "GENOME", 18, supply * 10 ** 18, mintTo);
        MockERC20 tokenD = new MockERC20("MistCoin",     "MC", 18, supply * 10 ** 18, mintTo);
        MockERC20 tokenE = new MockERC20("ZyneCoin",     "ZYN", 18, supply * 10 ** 18, mintTo);

        console.log("tLTC:", address(tokenA));
        console.log("STPT:", address(tokenB));
        console.log("GENOME:", address(tokenC));
        console.log("MistCoin:", address(tokenD));
        console.log("ZyneCoin:", address(tokenE));


        // add tokens to faucet contract
        // send 1 million of each to faucet ca - 
        


        vm.stopBroadcast();
    }
}

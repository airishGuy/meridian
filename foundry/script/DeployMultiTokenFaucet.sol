// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/MultiTokenFaucet.sol";

contract DeployFaucet is Script {
    function run() external {

        // --- Configure your 5 tokens here ---
        // Amounts are 1000 tokens, scaled to each token's decimals
        address[] memory tokens = new address[](6);
        tokens[0] = 0x0188e0ce0804D5f431AB70ee94024b68a46bBA71;
        tokens[1] = 0x01f9b27f4C3dE3511983C2f90b0A6Af59863cdbD;
        tokens[2] = 0xF56b200f4007FF00B92dfd2C87183a20bdf7EE75;
        tokens[3] = 0xf2FD1F1171C902a69B30b0cd75e2d0e7C499eEfe; 
        tokens[4] = 0x5a6285C084B4b31eFC4562481D03b398d1715C47;
        tokens[5] = 0x666301A904602452b6172f9F5070832767B12DF1;



        uint256[] memory amounts = new uint256[](6);
        amounts[0] = 1000 * 10 ** 6;  
        amounts[1] = 1000 * 10 ** 18; 
        amounts[2] = 1000 * 10 ** 18; 
        amounts[3] = 1000 * 10 ** 18; 
        amounts[4] = 1000 * 10 ** 18; 
        amounts[5] = 1000 * 10 ** 18;


        vm.startBroadcast();

        MultiTokenFaucet faucet = new MultiTokenFaucet(tokens, amounts);

        // Set cooldown to 24 hours (adjust as needed)
        faucet.setCooldown(24 hours);

        vm.stopBroadcast();

        console.log("MultiTokenFaucet deployed at:", address(faucet));
    }
}
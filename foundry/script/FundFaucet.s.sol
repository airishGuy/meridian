// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract FundFaucet is Script {
    address constant FAUCET = 0xFF4F9485CabF80a4CB77243dB138296a12A2A0ce;

    address constant TUSDT  = 0x0188e0ce0804D5f431AB70ee94024b68a46bBA71; // 6 decimals
    address constant TLTC   = 0x01f9b27f4C3dE3511983C2f90b0A6Af59863cdbD; // 18 decimals
    address constant STPT   = 0xF56b200f4007FF00B92dfd2C87183a20bdf7EE75; // 18 decimals
    address constant GENOME = 0xf2FD1F1171C902a69B30b0cd75e2d0e7C499eEfe; // 18 decimals
    address constant MC     = 0x5a6285C084B4b31eFC4562481D03b398d1715C47; // 18 decimals
    address constant ZYN    = 0x666301A904602452b6172f9F5070832767B12DF1; // 18 decimals

    function run() external {
        uint256 amount6Decimals  = 10_000_000 * 10 ** 6;  // 10M tUSDT (10^13)
        uint256 amount18Decimals = 10_000_000 * 10 ** 18; // 10M for 18-decimal tokens (10^25)

        vm.startBroadcast();

        IERC20(TUSDT).transfer(FAUCET, amount6Decimals);
        console.log("Transferred 10M tUSDT to:", FAUCET);

        IERC20(TLTC).transfer(FAUCET, amount18Decimals);
        console.log("Transferred 10M tLTC to:", FAUCET);

        IERC20(STPT).transfer(FAUCET, amount18Decimals);
        console.log("Transferred 10M STPT to:", FAUCET);

        IERC20(GENOME).transfer(FAUCET, amount18Decimals);
        console.log("Transferred 10M GENOME to:", FAUCET);

        IERC20(MC).transfer(FAUCET, amount18Decimals);
        console.log("Transferred 10M MistCoin (MC) to:", FAUCET);

        IERC20(ZYN).transfer(FAUCET, amount18Decimals);
        console.log("Transferred 10M ZyneCoin (ZYN) to:", FAUCET);

        vm.stopBroadcast();
    }
}

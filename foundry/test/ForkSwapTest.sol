// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {UniversalRouter} from "@uniswap/universal-router/contracts/UniversalRouter.sol";
import {Commands} from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";



contract ForkSwapTest is Test {

    UniversalRouter router = UniversalRouter(payable(vm.envAddress("UNIVERSALROUTER_ADDRESS")));
    IPermit2 permit2 = IPermit2(vm.envAddress("PERMIT2_ADDRESS"));
    address tLTC = 0x01f9b27f4C3dE3511983C2f90b0A6Af59863cdbD;
    address GENOME = 0xf2FD1F1171C902a69B30b0cd75e2d0e7C499eEfe;
    address USER  = vm.envAddress("ADDRESS_TO_MINT_TO");

    function testForkSwap() public {
        vm.createSelectFork("LitVM_LiteForge");
        vm.startPrank(USER);

        // approve
        IERC20(tLTC).approve(address(permit2), type(uint256).max);
        permit2.approve(tLTC, address(router), type(uint160).max, uint48(block.timestamp + 1 days));

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(tLTC),
            currency1: Currency.wrap(GENOME),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });

        uint128 amountIn = 1e18; // 1 tLTC
        uint128 minAmountOut = 0;       // 0 to isolate revert reason

        bytes memory commands = abi.encodePacked(uint8(Commands.V4_SWAP));
        bytes memory actions = abi.encodePacked(
            uint8(Actions.SWAP_EXACT_IN_SINGLE),
            uint8(Actions.SETTLE_ALL),
            uint8(Actions.TAKE_ALL)
        );

        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(IV4Router.ExactInputSingleParams({
            poolKey: poolKey,
            zeroForOne: true,
            amountIn: amountIn,
            amountOutMinimum: minAmountOut,
            hookData: bytes("")
        }));
        params[1] = abi.encode(poolKey.currency0, amountIn);
        params[2] = abi.encode(poolKey.currency1, minAmountOut);

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);

        uint256 deadline = block.timestamp + 20;
        router.execute(commands, inputs, deadline);

        vm.stopPrank();
    }
}

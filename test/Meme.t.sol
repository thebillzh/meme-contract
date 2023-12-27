// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "forge-std/Vm.sol";

import {MemeTokenWillGoToZero} from "../contracts/MemeTokenWillGoToZero.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// for fuzz test
contract MemeTokenWillGoToZeroTest is Test {
    MemeTokenWillGoToZero private token;
    address private owner;
    address private signerAddress;
    uint256 private signerPrivateKey;

    receive() external payable {}

    function setUp() public {
        owner = address(this); // Test contract is the owner for simplicity
        address implementation = address(new MemeTokenWillGoToZero());
        bytes memory initData = abi.encodeCall(
            MemeTokenWillGoToZero.initialize,
            owner
        );
        address proxy = address(new ERC1967Proxy(implementation, initData));
        token = MemeTokenWillGoToZero(proxy);

        signerPrivateKey = 0xabc123;
        signerAddress = vm.addr(signerPrivateKey);

        // Set the signer address in the contract
        vm.startPrank(owner);
        token.setSignerAddress(signerAddress);
        vm.stopPrank();
    }

    function testFuzz_Mint(uint96 numberOfHundreds) public {
        vm.deal(owner, 10 ether);
        vm.startPrank(owner);

        uint256 requiredPayment = numberOfHundreds *
            token.PRICE_PER_HUNDRED_TOKENS();
        uint256 userBalanceBefore = owner.balance;
        uint256 tokenSupplyBefore = token.totalSupply();

        try token.mint{value: requiredPayment}(numberOfHundreds) {
            // Success case
            assertEq(
                token.balanceOf(owner),
                tokenSupplyBefore + (numberOfHundreds * token.MINT_INCREMENT())
            );
            assertEq(
                token.totalSupply(),
                tokenSupplyBefore + (numberOfHundreds * token.MINT_INCREMENT())
            );
            assertEq(owner.balance, userBalanceBefore - requiredPayment);
        } catch {
            // Failure case, e.g., insufficient payment or limits exceeded
            assertEq(token.balanceOf(owner), tokenSupplyBefore);
            assertEq(token.totalSupply(), tokenSupplyBefore);
            assertEq(owner.balance, userBalanceBefore);
        }

        vm.stopPrank();
    }

    function testFuzz_MintWithFid(
        uint96 numberOfHundreds,
        uint256 farcasterId
    ) public {
        // Exclude farcasterId = 0 and ensure enough funds
        vm.assume(farcasterId > 0);

        // Prepare the message to be signed
        bytes32 message = keccak256(
            abi.encodePacked(address(this), farcasterId)
        );
        bytes32 ethSignedMessage = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", message)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            signerPrivateKey,
            ethSignedMessage
        );
        bytes memory signature = abi.encodePacked(r, s, v);

        // get unit price
        uint256 unitPrice;
        uint256 newPricePctBasisPoints;

        if (
            farcasterId >= 1 &&
            farcasterId <= token.LAST_PRE_PERMISSIONLESS_FID()
        ) {
            // new price scales linearly between 10% (1000 basis points) and 90% (9000 basis points)
            newPricePctBasisPoints =
                1000 +
                (farcasterId * 8000) /
                token.LAST_PRE_PERMISSIONLESS_FID();
        } else {
            newPricePctBasisPoints = 9000;
        }

        unitPrice =
            (token.PRICE_PER_HUNDRED_TOKENS() * newPricePctBasisPoints) /
            10000;
        uint256 requiredPayment = uint256(numberOfHundreds) * unitPrice;
        vm.deal(address(this), requiredPayment + 1 ether); // Ensure enough ETH
        vm.startPrank(address(this));

        uint256 tokenSupplyBefore = token.totalSupply();
        uint256 userBalanceBefore = address(this).balance;

        try
            token.mintWithFid{value: requiredPayment}(
                numberOfHundreds,
                farcasterId,
                signature
            )
        {
            // Success case assertions
            uint256 tokensToMint = numberOfHundreds * token.MINT_INCREMENT();
            uint256 newBalance = token.balanceOf(address(this));
            uint256 newSupply = token.totalSupply();

            // Check if the tokens were correctly minted to the address
            assertEq(
                newBalance,
                tokensToMint,
                "Minted amount does not match expected balance"
            );

            // Check if the total supply was updated correctly
            assertEq(
                newSupply,
                tokenSupplyBefore + tokensToMint,
                "Total supply was not updated correctly"
            );

            // Check if the correct amount of ETH was deducted
            assertEq(
                address(this).balance,
                userBalanceBefore - requiredPayment,
                "Incorrect ETH amount deducted"
            );
        } catch Error(string memory reason) {
            // Failure case assertions
            if (
                keccak256(abi.encodePacked(reason)) ==
                keccak256(abi.encodePacked("Insufficient ETH sent"))
            ) {
                assertTrue(
                    requiredPayment > address(this).balance,
                    "Error reason mismatch for insufficient ETH"
                );
            } else if (
                keccak256(abi.encodePacked(reason)) ==
                keccak256(abi.encodePacked("Mint limit exceeded"))
            ) {
                assertTrue(
                    token.balanceOf(address(this)) +
                        numberOfHundreds *
                        token.MINT_INCREMENT() >
                        token.MAX_MINT_PER_ADDRESS(),
                    "Error reason mismatch for mint limit"
                );
            } else {
                // Handle other specific failure reasons based on your contract logic
                fail("Unexpected error reason");
            }
        }

        vm.stopPrank();
    }

    function testFuzz_Airdrop(address recipient, uint96 amount) public {
        // Exclude the zero address
        vm.assume(recipient != address(0));

        vm.startPrank(owner);
        uint256 tokenSupplyBefore = token.totalSupply();
        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        uint256 amountWithDecimals = amount * 10 ** token.decimals();

        try token.airdrop(recipient, amountWithDecimals) {
            assertEq(
                token.totalSupply(),
                tokenSupplyBefore + amountWithDecimals
            );
            assertEq(
                token.balanceOf(recipient),
                recipientBalanceBefore + amountWithDecimals
            );
        } catch Error(string memory reason) {
            if (token.totalSupply() + amountWithDecimals > token.MAX_SUPPLY()) {
                assertEq(reason, "Max supply exceeded");
            }
        }

        vm.stopPrank();
    }
}

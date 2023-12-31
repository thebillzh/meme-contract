// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "forge-std/Vm.sol";
import "forge-std/console.sol";

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
        bytes32 ethSignedMessage = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(address(this), farcasterId))
            )
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

        if (requiredPayment > address(this).balance) {
            vm.expectRevert(MemeTokenWillGoToZero.InvalidPayment.selector);
            token.mintWithFid{value: requiredPayment}(
                numberOfHundreds,
                farcasterId,
                signature
            );
        } else if (
            token.balanceOf(address(this)) +
                numberOfHundreds *
                token.MINT_INCREMENT() >
            token.MAX_MINT_PER_ADDRESS()
        ) {
            vm.expectRevert(MemeTokenWillGoToZero.MintLimitExceeded.selector);
            token.mintWithFid{value: requiredPayment}(
                numberOfHundreds,
                farcasterId,
                signature
            );
        } else {
            token.mintWithFid{value: requiredPayment}(
                numberOfHundreds,
                farcasterId,
                signature
            );
            // Check if the tokens were correctly minted to the address
            assertEq(
                token.balanceOf(address(this)),
                numberOfHundreds * token.MINT_INCREMENT(),
                "Minted amount does not match expected balance"
            );

            // Check if the total supply was updated correctly
            assertEq(
                token.totalSupply(),
                tokenSupplyBefore + numberOfHundreds * token.MINT_INCREMENT(),
                "Total supply was not updated correctly"
            );

            // Check if the correct amount of ETH was deducted
            assertEq(
                address(this).balance,
                userBalanceBefore - requiredPayment,
                "Incorrect ETH amount deducted"
            );
        }

        vm.stopPrank();
    }

    function testFuzz_Airdrop(address recipient, uint96 amount) public {
        vm.assume(recipient != address(0));

        uint256 tokenSupplyBefore = token.totalSupply();
        uint256 maxAllowedAirdrop = token.MAX_SUPPLY() - tokenSupplyBefore;
        uint256 amountWithDecimals = amount * 10 ** token.decimals();

        vm.startPrank(owner);

        if (amountWithDecimals > maxAllowedAirdrop) {
            vm.expectRevert(MemeTokenWillGoToZero.MaxSupplyExceeded.selector);
            token.airdrop(recipient, amount);
        } else {
            token.airdrop(recipient, amount);

            assertEq(
                token.totalSupply(),
                tokenSupplyBefore + amountWithDecimals,
                "Total supply did not increase correctly"
            );
            assertEq(
                token.balanceOf(recipient),
                amountWithDecimals,
                "Recipient did not receive the correct amount"
            );
        }

        vm.stopPrank();
    }

    mapping(address => uint256) expectedBalances;

    function testFuzz_BatchAirdrop(
        address[] memory recipients,
        uint256[] memory amounts
    ) public {
        uint256 maxAmount = type(uint256).max / 10 ** token.decimals();

        for (uint256 i = 0; i < amounts.length; i++) {
            vm.assume(amounts[i] > 0 && amounts[i] <= maxAmount);
        }

        uint256[] memory amountsWithDecimals = new uint256[](amounts.length);
        for (uint256 i = 0; i < amounts.length; i++) {
            amountsWithDecimals[i] = amounts[i] * 10 ** token.decimals();
            if (i >= recipients.length) {
                continue;
            }
            vm.assume(recipients[i] != address(0));
            expectedBalances[recipients[i]] += amountsWithDecimals[i];
        }

        vm.startPrank(owner);
        uint256 tokenSupplyBefore = token.totalSupply();

        if (
            recipients.length != amounts.length ||
            recipients.length == 0 ||
            amounts.length == 0
        ) {
            vm.expectRevert(MemeTokenWillGoToZero.InvalidBatchInput.selector);
            token.batchAirdrop(recipients, amounts);
        } else if (
            token.totalSupply() + sum(amountsWithDecimals) > token.MAX_SUPPLY()
        ) {
            vm.expectRevert(MemeTokenWillGoToZero.MaxSupplyExceeded.selector);
            token.batchAirdrop(recipients, amounts);
        } else {
            token.batchAirdrop(recipients, amounts);
            for (uint256 i = 0; i < recipients.length; i++) {
                assertEq(
                    token.balanceOf(recipients[i]),
                    expectedBalances[recipients[i]],
                    "Incorrect balance after airdrop"
                );
            }
            assertEq(
                token.totalSupply(),
                tokenSupplyBefore + sum(amountsWithDecimals),
                "Total supply did not update correctly"
            );
        }

        vm.stopPrank();
    }

    function sum(uint256[] memory arr) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < arr.length; ++i) {
            total += arr[i];
        }
    }

    function testFuzz_WithdrawToPurple() public {
        uint256 contractBalance = 1 ether;
        vm.deal(address(token), contractBalance);

        uint256 treasuryBalanceBefore = token.PURPLE_DAO_TREASURY().balance;

        token.withdrawToPurple();

        // Check that the contract's balance is zero
        assertEq(
            address(token).balance,
            0,
            "Contract balance should be zero after withdrawal"
        );

        // Check that the treasury's balance increased by the contract's previous balance
        assertEq(
            token.PURPLE_DAO_TREASURY().balance,
            treasuryBalanceBefore + contractBalance,
            "Treasury did not receive correct amount"
        );
    }

    function testFuzz_SetSignerAddress(address _newSigner) public {
        vm.assume(
            _newSigner != address(0) && _newSigner != token.signerAddress()
        );

        // Only the owner should be able to call this function
        vm.prank(owner);
        token.setSignerAddress(_newSigner);

        // Assert that the signer address was updated correctly
        assertEq(
            token.signerAddress(),
            _newSigner,
            "Signer address was not updated correctly"
        );
    }
}

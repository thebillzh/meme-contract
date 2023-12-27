// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @custom:security-contact billzh@aburra.xyz
contract Test_MemeTokenWillGoToZeroV2 is
    Initializable,
    ERC20Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using ECDSA for bytes32;

    uint256 public MAX_SUPPLY;
    uint256 public MAX_MINT_PER_ADDRESS;
    uint256 public constant PRICE_PER_HUNDRED_TOKENS = 0.0001 ether;
    uint256 public MINT_INCREMENT;
    uint256 public constant LAST_PRE_PERMISSIONLESS_FID = 20939;

    address public signerAddress;
    address public constant PURPLE_DAO_TREASURY =
        0xeB5977F7630035fe3b28f11F9Cb5be9F01A9557D;

    mapping(address => uint256) public mintedAmounts;

    // events
    event TokensMinted(address indexed user, uint256 amount);
    event TokensMintedWithFid(
        address indexed user,
        uint256 amount,
        uint256 farcasterId
    );
    event TokensAirdropped(address indexed recipient, uint256 amount);
    event WithdrawalToPurple(uint256 amount);
    event SignerAddressChanged(address newSigner);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __ERC20_init("TESTSHIT", "TESTSHIT");
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        signerAddress = initialOwner;
        MAX_SUPPLY = 1000000000 * 10 ** decimals();
        MAX_MINT_PER_ADDRESS = 20000000 * 10 ** decimals();
        MINT_INCREMENT = 100 * 10 ** decimals();
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    function mint(uint256 numberOfHundreds) public payable {
        uint256 tokensToMint = numberOfHundreds * MINT_INCREMENT;
        uint256 requiredPayment = numberOfHundreds * PRICE_PER_HUNDRED_TOKENS;

        _mintTokens(_msgSender(), tokensToMint, requiredPayment, msg.value);
        emit TokensMinted(_msgSender(), tokensToMint);
    }

    function mintWithFid(
        uint256 numberOfHundreds,
        uint256 farcasterId,
        bytes memory signature
    ) public payable {
        require(farcasterId > 0, "FID must be a positive integer");

        // check signature
        bytes32 message = keccak256(
            abi.encodePacked(_msgSender(), farcasterId)
        );
        bytes32 signedMessageHash = MessageHashUtils.toEthSignedMessageHash(
            message
        );
        require(
            signedMessageHash.recover(signature) == signerAddress,
            "Invalid signature"
        );

        uint256 tokensToMint = numberOfHundreds * MINT_INCREMENT;
        uint256 unitPrice = _calculateUnitPrice(farcasterId);
        uint256 requiredPayment = unitPrice * numberOfHundreds;

        _mintTokens(_msgSender(), tokensToMint, requiredPayment, msg.value);
        emit TokensMintedWithFid(_msgSender(), tokensToMint, farcasterId);
    }

    function _mintTokens(
        address to,
        uint256 tokensToMint,
        uint256 requiredPayment,
        uint256 currentPayment
    ) internal nonReentrant {
        require(currentPayment >= requiredPayment, "Insufficient ETH sent");
        require(
            mintedAmounts[to] + tokensToMint <= MAX_MINT_PER_ADDRESS,
            "Mint limit exceeded"
        );
        require(
            totalSupply() + tokensToMint <= MAX_SUPPLY,
            "Max supply exceeded"
        );

        mintedAmounts[to] += tokensToMint;

        if (currentPayment > requiredPayment) {
            uint256 excessAmount = currentPayment - requiredPayment;
            (bool sentRefund, ) = payable(to).call{value: excessAmount}("");
            require(sentRefund, "Failed to refund excess Ether");
        }

        _mint(to, tokensToMint);
    }

    function _calculateUnitPrice(
        uint256 farcasterId
    ) internal pure returns (uint256) {
        uint256 newPricePctBasisPoints;

        if (farcasterId >= 1 && farcasterId <= LAST_PRE_PERMISSIONLESS_FID) {
            // new price scales linearly between 10% (1000 basis points) and 90% (9000 basis points)
            newPricePctBasisPoints =
                1000 +
                (farcasterId * 8000) /
                LAST_PRE_PERMISSIONLESS_FID;
        } else {
            newPricePctBasisPoints = 9000;
        }

        return (PRICE_PER_HUNDRED_TOKENS * newPricePctBasisPoints) / 10000;
    }

    function remainingMintQuota(address user) public view returns (uint256) {
        return MAX_MINT_PER_ADDRESS - mintedAmounts[user];
    }

    function airdrop(address to, uint256 amount) public onlyOwner {
        _airdrop(to, amount);
    }

    function batchAirdrop(
        address[] memory recipients,
        uint256[] memory amounts
    ) public onlyOwner {
        require(
            recipients.length == amounts.length,
            "Mismatched array lengths"
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            _airdrop(recipients[i], amounts[i]);
        }
    }

    function _airdrop(address recipient, uint256 amount) internal nonReentrant {
        uint256 amountWithDecimals = amount * 10 ** decimals();
        require(
            totalSupply() + amountWithDecimals <= MAX_SUPPLY,
            "Max supply exceeded"
        );
        _mint(recipient, amountWithDecimals);
        emit TokensAirdropped(recipient, amountWithDecimals);
    }

    function withdrawToPurple() public nonReentrant {
        uint256 balance = address(this).balance;
        (bool sent, ) = payable(PURPLE_DAO_TREASURY).call{value: balance}("");
        require(sent, "Failed to send Ether");
        emit WithdrawalToPurple(balance);
    }

    function setSignerAddress(
        address _signerAddress
    ) public onlyOwner nonReentrant {
        signerAddress = _signerAddress;
        emit SignerAddressChanged(_signerAddress);
    }

    function setMaxTotalSupply() public onlyOwner nonReentrant {
        MAX_SUPPLY = 2000000000 * 10 ** decimals();
    }
}

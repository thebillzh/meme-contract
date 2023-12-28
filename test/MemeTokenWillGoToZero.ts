/* eslint-disable no-console */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import {
  ContractTransactionResponse,
  getBytes,
  parseEther,
  solidityPackedKeccak256,
} from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  MemeTokenWillGoToZero,
  Test_MemeTokenWillGoToZeroV2,
} from "../typechain-types";

const FARCASTER_ID = 6868;
const FARCASTER_ID_OUT_OF_RANGE = 99999;
const PRICE_PER_HUNDRED_TOKENS = parseEther("0.0001");
const LAST_PRE_PERMISSIONLESS_FID = BigInt(20939);

const calculateUnitPrice = (fid: number): bigint => {
  const farcasterId = BigInt(fid);
  let newPricePct = BigInt(0);
  if (farcasterId >= 1 && farcasterId <= LAST_PRE_PERMISSIONLESS_FID) {
    // new price scales linearly between 10% (fid=0) and 90% (fid=LAST_PRE_PERMISSIONLESS_FID)
    newPricePct =
      BigInt(1000) + (farcasterId * BigInt(8000)) / LAST_PRE_PERMISSIONLESS_FID;
  } else {
    newPricePct = BigInt(9000);
  }
  return (PRICE_PER_HUNDRED_TOKENS * newPricePct) / BigInt(10000);
};

describe("MemeTokenWillGoToZero", () => {
  const deployMemeTokenFixture = async () => {
    // Init signers
    const [owner, addr1, addr2, addr3] = await ethers.getSigners();

    // Deploy the contract
    const MemeTokenFactory = await ethers.getContractFactory(
      "MemeTokenWillGoToZero"
    );
    const memeToken = (await upgrades.deployProxy(
      MemeTokenFactory,
      [await owner.getAddress()],
      {
        initializer: "initialize",
      }
    )) as unknown as MemeTokenWillGoToZero;

    await memeToken.waitForDeployment();

    const proxyAddress = await memeToken.getAddress();
    const implAddress = await upgrades.erc1967.getImplementationAddress(
      proxyAddress
    );
    console.log("[deploy] MemeToken Proxy deployed to:", proxyAddress);
    console.log("[deploy] MemeToken Implementation deployed to:", implAddress);

    return { memeToken, owner, addr1, addr2, addr3 };
  };

  let memeToken: MemeTokenWillGoToZero;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;
  let addr3: HardhatEthersSigner;

  beforeEach("deploying", async () => {
    ({ memeToken, owner, addr1, addr2, addr3 } = await loadFixture(
      deployMemeTokenFixture
    ));
  });

  // Test cases here
  it("should deploy correctly", async () => {
    const TOKEN_NAME = "FARTS";
    const TOKEN_SYMBOL = "FARTS";

    // Check if proxy contract is deployed
    const proxyAddress = await memeToken.getAddress();
    expect(proxyAddress).to.be.properAddress;
    expect(await ethers.provider.getCode(proxyAddress)).to.not.equal("0x");

    // Retrieve implementation contract address from the proxy
    const implAddress = await upgrades.erc1967.getImplementationAddress(
      proxyAddress
    );
    expect(implAddress).to.be.properAddress;
    expect(await ethers.provider.getCode(implAddress)).to.not.equal("0x");

    // Validate contract functionality through the proxy
    const name = await memeToken.name();
    const symbol = await memeToken.symbol();
    expect(name).to.equal(TOKEN_NAME);
    expect(symbol).to.equal(TOKEN_SYMBOL);

    // Verify correct initialization of state variables
    const maxSupply = await memeToken.MAX_SUPPLY();
    const maxMintPerAddress = await memeToken.MAX_MINT_PER_ADDRESS();
    const mintIncrement = await memeToken.MINT_INCREMENT();
    const signerAddress = await memeToken.signerAddress();
    expect(maxSupply).to.equal(
      BigInt(1000000000) * BigInt(10) ** (await memeToken.decimals())
    );
    expect(maxMintPerAddress).to.equal(
      BigInt(20000000) * BigInt(10) ** (await memeToken.decimals())
    );
    expect(mintIncrement).to.equal(
      BigInt(100) * BigInt(10) ** (await memeToken.decimals())
    );
    expect(signerAddress).to.equal(await owner.getAddress());
  });

  describe("_mintTokens", () => {
    it("should revert if insufficient ETH is sent", async () => {
      const numberOfHundreds = 1n;
      const insufficientPayment =
        numberOfHundreds * PRICE_PER_HUNDRED_TOKENS - 1n;
      await expect(
        memeToken.connect(addr1).mint(numberOfHundreds, {
          value: insufficientPayment,
        })
      ).to.be.revertedWithCustomError(memeToken, "InvalidPayment");
    });
    it("should revert if extra ETH is sent", async () => {
      const numberOfHundreds = 1n;
      const extraPayment = numberOfHundreds * PRICE_PER_HUNDRED_TOKENS + 1n;
      await expect(
        memeToken.connect(addr1).mint(numberOfHundreds, {
          value: extraPayment,
        })
      ).to.be.revertedWithCustomError(memeToken, "InvalidPayment");
    });

    it("should revert if mint limit per address is exceeded", async () => {
      const maxMintPerAddress = await memeToken.MAX_MINT_PER_ADDRESS();
      const tooManyTokensInHundreds =
        maxMintPerAddress /
          BigInt(10) ** (await memeToken.decimals()) /
          BigInt(100) +
        BigInt(1);
      await expect(
        memeToken.connect(addr1).mint(tooManyTokensInHundreds, {
          value: tooManyTokensInHundreds * PRICE_PER_HUNDRED_TOKENS,
        })
      ).to.be.revertedWithCustomError(memeToken, "MintLimitExceeded");
    });

    it("should revert if max supply is exceeded", async () => {
      const MAX_MINT_HUNDREDS_PER_ADDRESS = BigInt(20000000) / BigInt(100);

      const maxSupply = await memeToken.MAX_SUPPLY();
      const maxMintPerAddress = await memeToken.MAX_MINT_PER_ADDRESS();
      for (let i = 0; i < maxSupply / maxMintPerAddress; i++) {
        let wallet = ethers.Wallet.createRandom();
        wallet = wallet.connect(ethers.provider);
        const requiredPayment =
          MAX_MINT_HUNDREDS_PER_ADDRESS * PRICE_PER_HUNDRED_TOKENS;

        await addr1.sendTransaction({
          to: wallet.address,
          value: requiredPayment * BigInt(2),
        });
        await memeToken.connect(wallet).mint(MAX_MINT_HUNDREDS_PER_ADDRESS, {
          value: requiredPayment,
        });
      }

      await expect(
        memeToken.connect(addr1).mint(MAX_MINT_HUNDREDS_PER_ADDRESS, {
          value: MAX_MINT_HUNDREDS_PER_ADDRESS * PRICE_PER_HUNDRED_TOKENS,
        })
      ).to.be.revertedWithCustomError(memeToken, "MaxSupplyExceeded");
    });
  });

  describe("mint", () => {
    let tx: ContractTransactionResponse;
    const numberOfHundreds = BigInt(5);
    let expectedTokens: bigint;
    let balanceBeforeMint: bigint;
    const EXTRA_VALUE_TRANSFERED = parseEther("0.1");

    beforeEach("minting", async () => {
      balanceBeforeMint = await ethers.provider.getBalance(
        await addr1.getAddress()
      );
      expectedTokens =
        numberOfHundreds *
        BigInt(100) *
        BigInt(10) ** (await memeToken.decimals());
      tx = await memeToken.connect(addr1).mint(numberOfHundreds, {
        value: numberOfHundreds * PRICE_PER_HUNDRED_TOKENS,
      });
    });

    it("should mint tokens correctly", async () => {
      expect(await memeToken.balanceOf(await addr1.getAddress())).to.equal(
        expectedTokens
      );
    });

    it("should emit TokensMinted event on mint", async () => {
      await expect(tx)
        .to.emit(memeToken, "TokensMinted")
        .withArgs(await addr1.getAddress(), expectedTokens);
    });

    // it("should refund", async () => {
    //   const receipt = await tx.provider.getTransactionReceipt(tx.hash);
    //   if (!receipt) {
    //     throw new Error("Empty transaction receipt");
    //   }
    //   expect(
    //     await ethers.provider.getBalance(await addr1.getAddress())
    //   ).to.equal(
    //     balanceBeforeMint -
    //       numberOfHundreds * PRICE_PER_HUNDRED_TOKENS -
    //       receipt.gasUsed * receipt.gasPrice
    //   );
    // });
  });

  const mintWithFid = (fid: number) => {
    let tx: ContractTransactionResponse;
    const numberOfHundreds = BigInt(5);
    let expectedTokens: bigint;

    beforeEach("minting with FID", async () => {
      const unitPrice = calculateUnitPrice(fid);
      const requiredPayment = numberOfHundreds * unitPrice;

      const message = solidityPackedKeccak256(
        ["address", "uint256"],
        [await addr1.getAddress(), fid]
      );
      const messageHashBytes = getBytes(message);
      const signature = await owner.signMessage(messageHashBytes);

      tx = await memeToken
        .connect(addr1)
        .mintWithFid(numberOfHundreds, fid, signature, {
          value: requiredPayment,
        });

      expectedTokens =
        numberOfHundreds *
        BigInt(100) *
        BigInt(10) ** (await memeToken.decimals());
    });
    it("should mint with FID correctly", async () => {
      expect(await memeToken.balanceOf(await addr1.getAddress())).to.equal(
        expectedTokens
      );
    });

    it("should emit TokensMintedWithFid event on mint with FID", async () => {
      await expect(tx)
        .to.emit(memeToken, "TokensMintedWithFid")
        .withArgs(await addr1.getAddress(), expectedTokens, fid);
    });

    it("should revert if farcasterId is <= 0", async () => {
      const unitPrice = calculateUnitPrice(fid);
      const requiredPayment = numberOfHundreds * unitPrice;

      const message = solidityPackedKeccak256(
        ["address", "uint256"],
        ["0x0000000000000000000000000000000000000000", fid]
      );
      const messageHashBytes = getBytes(message);
      const signature = await owner.signMessage(messageHashBytes);
      await expect(
        memeToken.connect(addr1).mintWithFid(numberOfHundreds, 0, signature, {
          value: requiredPayment,
        })
      ).to.be.revertedWithCustomError(memeToken, "InvalidFid");
    });

    it("should revert if signature is invalid", async () => {
      const unitPrice = calculateUnitPrice(fid);
      const requiredPayment = numberOfHundreds * unitPrice;

      const message = solidityPackedKeccak256(
        ["address", "uint256"],
        ["0x0000000000000000000000000000000000000000", fid]
      );
      const messageHashBytes = getBytes(message);
      const signature = await owner.signMessage(messageHashBytes);
      await expect(
        memeToken
          .connect(addr1)
          .mintWithFid(numberOfHundreds, FARCASTER_ID, signature, {
            value: requiredPayment,
          })
      ).to.be.revertedWithCustomError(memeToken, "InvalidSignature");
    });
  };

  describe("mintWithFid", () => {
    mintWithFid(FARCASTER_ID);
  });

  describe("mintWithFid - fid out of range", () => {
    mintWithFid(FARCASTER_ID_OUT_OF_RANGE);
  });

  it("should allow only owner to airdrop", async () => {
    const amount = BigInt(1000000);
    const amountWithDecimals =
      amount * BigInt(10) ** (await memeToken.decimals());

    await expect(
      memeToken.connect(owner).airdrop(await addr1.getAddress(), amount)
    )
      .to.emit(memeToken, "TokensAirdropped")
      .withArgs(await addr1.getAddress(), amountWithDecimals);

    // Check balance of addr1
    expect(await memeToken.balanceOf(await addr1.getAddress())).to.equal(
      amountWithDecimals
    );
  });

  describe("batchAirdrop", () => {
    it("should batch airdrop correctly", async () => {
      const amount = BigInt(1000000);
      const amountWithDecimals =
        amount * BigInt(10) ** (await memeToken.decimals());

      await expect(
        memeToken
          .connect(owner)
          .batchAirdrop(
            [
              await addr1.getAddress(),
              await addr2.getAddress(),
              await addr3.getAddress(),
            ],
            [amount, amount * BigInt(2), amount * BigInt(3)]
          )
      )
        .to.emit(memeToken, "TokensAirdropped")
        .withArgs(await addr1.getAddress(), amountWithDecimals)
        .to.emit(memeToken, "TokensAirdropped")
        .withArgs(await addr2.getAddress(), amountWithDecimals * BigInt(2))
        .to.emit(memeToken, "TokensAirdropped")
        .withArgs(await addr3.getAddress(), amountWithDecimals * BigInt(3));

      // Check balance
      expect(await memeToken.balanceOf(await addr1.getAddress())).to.equal(
        amountWithDecimals
      );
      expect(await memeToken.balanceOf(await addr2.getAddress())).to.equal(
        amountWithDecimals * BigInt(2)
      );
      expect(await memeToken.balanceOf(await addr3.getAddress())).to.equal(
        amountWithDecimals * BigInt(3)
      );
    });

    it("should revert if array lengths are mismatched", async () => {
      const amount = BigInt(1000000);
      await expect(
        memeToken
          .connect(owner)
          .batchAirdrop(
            [
              await addr1.getAddress(),
              await addr2.getAddress(),
              await addr3.getAddress(),
            ],
            [amount, amount * BigInt(2)]
          )
      ).to.be.revertedWithCustomError(memeToken, "InvalidBatchInput");
    });
    it("should revert if array is empty", async () => {
      await expect(
        memeToken.connect(owner).batchAirdrop([], [])
      ).to.be.revertedWithCustomError(memeToken, "InvalidBatchInput");
    });
  });

  it("should withdraw to Purple DAO correctly", async () => {
    const numberOfHundreds = BigInt(5);
    const expectedValue = numberOfHundreds * PRICE_PER_HUNDRED_TOKENS;
    await memeToken.connect(addr1).mint(numberOfHundreds, {
      value: expectedValue,
    });
    const balanceBeforeWithdrawal = await ethers.provider.getBalance(
      await memeToken.PURPLE_DAO_TREASURY()
    );

    expect(await memeToken.withdrawToPurple())
      .to.emit(memeToken, "WithdrawalToPurple")
      .withArgs(expectedValue);
    expect(
      await ethers.provider.getBalance(await memeToken.PURPLE_DAO_TREASURY())
    ).to.equal(balanceBeforeWithdrawal + expectedValue);
  });

  describe("setSignerAddress", () => {
    it("should allow only owner to set signer address", async () => {
      const newSignerAddress = await addr1.getAddress();
      await memeToken.connect(owner).setSignerAddress(newSignerAddress);
      expect(await memeToken.signerAddress()).to.equal(newSignerAddress);
    });

    it("should revert when trying to set signer address to zero address", async () => {
      await expect(
        memeToken.connect(owner).setSignerAddress(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(memeToken, "InvalidAddress");
    });
  });

  it("should return remaining mint quota correctly", async () => {
    const { memeToken, addr1 } = await loadFixture(deployMemeTokenFixture);
    const MAX_MINT_PER_ADDRESS =
      BigInt(20000000) * BigInt(10) ** (await memeToken.decimals());

    const numberOfHundreds = BigInt(5);
    const mintedTokens =
      numberOfHundreds *
      BigInt(100) *
      BigInt(10) ** (await memeToken.decimals());
    await memeToken.connect(addr1).mint(numberOfHundreds, {
      value: numberOfHundreds * PRICE_PER_HUNDRED_TOKENS,
    });

    expect(
      await memeToken.remainingMintQuota(await addr1.getAddress())
    ).to.equal(MAX_MINT_PER_ADDRESS - mintedTokens);
  });

  it("should upgrade contract correctly", async () => {
    const v1MaxTotalSupply = await memeToken.MAX_SUPPLY();

    const MAX_MINT_PER_ADDRESS =
      BigInt(20000000) * BigInt(10) ** (await memeToken.decimals());

    const numberOfHundreds = BigInt(5);
    const mintedTokens =
      numberOfHundreds *
      BigInt(100) *
      BigInt(10) ** (await memeToken.decimals());
    await memeToken.connect(addr1).mint(numberOfHundreds, {
      value: numberOfHundreds * PRICE_PER_HUNDRED_TOKENS,
    });

    const Test_MemeTokenWillGoToZeroV2 = await ethers.getContractFactory(
      "Test_MemeTokenWillGoToZeroV2"
    );
    const memeTokenV2 = (await upgrades.upgradeProxy(
      await memeToken.getAddress(),
      Test_MemeTokenWillGoToZeroV2,
      { call: { fn: "setMaxTotalSupply" } }
    )) as unknown as Test_MemeTokenWillGoToZeroV2;

    const v2MaxTotalSupply = await memeTokenV2.MAX_SUPPLY();

    // Max total should be doubled
    expect(v1MaxTotalSupply * BigInt(2)).to.equal(v2MaxTotalSupply);

    // Other parameters should not be changed
    expect(
      await memeTokenV2.remainingMintQuota(await addr1.getAddress())
    ).to.equal(MAX_MINT_PER_ADDRESS - mintedTokens);
  });
});

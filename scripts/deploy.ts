/* eslint-disable no-console */
import { ethers, upgrades } from "hardhat";

const main = async () => {
  const MemeTokenWillGoToZero = await ethers.getContractFactory(
    "MemeTokenWillGoToZero"
  );
  const memeToken = await upgrades.deployProxy(MemeTokenWillGoToZero, [], {
    initializer: "initialize",
  });
  await memeToken.deployed();
  console.log("MemeTokenWillGoToZero deployed to:", memeToken.address);
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

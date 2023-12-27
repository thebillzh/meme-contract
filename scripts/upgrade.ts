/* eslint-disable no-console */
import { ethers, upgrades } from "hardhat";

const main = async () => {
  const MemeTokenWillGoToZeroV2 = await ethers.getContractFactory(
    "MemeTokenWillGoToZeroV2"
  );
  const memeTokenAddress = "DEPLOYED_CONTRACT_ADDRESS";
  const memeTokenV2 = await upgrades.upgradeProxy(
    memeTokenAddress,
    MemeTokenWillGoToZeroV2
  );
  console.log("MemeTokenWillGoToZero upgraded to V2 at:", memeTokenV2.address);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

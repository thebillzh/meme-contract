/* eslint-disable no-console */
import { ethers, upgrades } from "hardhat";

const main = async () => {
  const MemeTokenWillGoToZeroV2 = await ethers.getContractFactory(
    "MemeTokenWillGoToZeroV2"
  );
  const memeTokenAddress = "DEPLOYED_PROXY_ADDRESS";
  const memeTokenV2 = await upgrades.upgradeProxy(
    memeTokenAddress,
    MemeTokenWillGoToZeroV2
  );
  await memeTokenV2.waitForDeployment();
  console.log(
    "MemeTokenWillGoToZero upgraded to V2 at:",
    await memeTokenV2.getAddress()
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

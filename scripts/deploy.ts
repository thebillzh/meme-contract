/* eslint-disable no-console */
import dotenv from "dotenv";
import { formatEther } from "ethers";
import { ethers, upgrades } from "hardhat";

dotenv.config();

const main = async () => {
  const [wallet] = await ethers.getSigners();
  const MemeTokenWillGoToZero = await ethers.getContractFactory(
    "MemeTokenWillGoToZero"
  );
  const balance = await ethers.provider.getBalance(wallet.address);

  console.log(
    `Start deploying with wallet ${wallet.address} (balance: ${formatEther(
      balance
    )} ETH)`
  );

  const memeToken = await upgrades.deployProxy(
    MemeTokenWillGoToZero,
    [await wallet.getAddress()],
    {
      initializer: "initialize",
    }
  );
  const tx = memeToken.deploymentTransaction();
  if (tx) {
    console.log(`Deploying\ntransaction hash: ${tx.hash}`);
  }

  const contract = await memeToken.waitForDeployment();
  const proxyAddress = await contract.getAddress();

  console.log(
    `Deployed\nproxy address: ${proxyAddress}\nimpl address ${await upgrades.erc1967.getImplementationAddress(
      proxyAddress
    )}`
  );
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const CrossChainMessenger = await ethers.getContractFactory("CrossChainMessenger");
  const messenger = await CrossChainMessenger.deploy(deployer.address);
  await messenger.waitForDeployment();
  console.log("CrossChainMessenger deployed to:", messenger.target);

  const TestTarget = await ethers.getContractFactory("TestTarget");
  const testTarget = await TestTarget.deploy();
  await testTarget.waitForDeployment();
  console.log("TestTarget deployed to:", testTarget.target);

  console.log("\nEnabling chains...");
  const chains = [
    { id: 1, name: "Ethereum" },
    { id: 137, name: "Polygon" },
    { id: 56, name: "BSC" },
    { id: 42161, name: "Arbitrum" },
    { id: 10, name: "Optimism" }
  ];

  for (const chain of chains) {
    try {
      await messenger.enableChain(chain.id);
      console.log(`✓ ${chain.name}`);
    } catch (error) {
      console.log(`✗ ${chain.name}: ${error.message}`);
    }
  }

  console.log("\nDeployment complete!");
  console.log("CrossChainMessenger:", messenger.target);
  console.log("TestTarget:", testTarget.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 
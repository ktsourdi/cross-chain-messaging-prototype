const { ethers } = require("hardhat");

async function main() {
  try {
    const signers = await ethers.getSigners();
    
    if (signers.length === 0) {
      throw new Error("No signers available. Check your private key in .env file");
    }
    
    const deployer = signers[0];
    
    if (!deployer) {
      throw new Error("Deployer is undefined. Check your network configuration");
    }

    console.log("Deploying with account:", deployer.address);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");
    
    if (balance === 0n) {
      console.log("⚠️  Warning: Account has 0 ETH. You may need testnet ETH to deploy.");
    }

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
    
  } catch (error) {
    console.error("Deployment failed:", error.message);
    if (error.reason) {
      console.error("Reason:", error.reason);
    }
    if (error.code) {
      console.error("Error code:", error.code);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 
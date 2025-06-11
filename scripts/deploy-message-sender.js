const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying CrossChainMessageSender with account:", deployer.address);
    console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

    // Deploy CrossChainMessageSender
    const CrossChainMessageSender = await ethers.getContractFactory("CrossChainMessageSender");
    const messageSender = await CrossChainMessageSender.deploy(deployer.address);
    await messageSender.waitForDeployment();

    const senderAddress = await messageSender.getAddress();
    console.log("CrossChainMessageSender deployed to:", senderAddress);

    // Enable BSC testnet (chain ID 97)
    console.log("Enabling BSC testnet (chain 97)...");
    const enableTx = await messageSender.enableChain(97);
    await enableTx.wait();
    console.log("BSC testnet enabled!");

    // Verify deployment
    console.log("Chain 97 enabled:", await messageSender.enabledChains(97));
    console.log("Message counter:", await messageSender.messageCounter());
    
    console.log("\nDeployment Summary:");
    console.log("===================");
    console.log("CrossChainMessageSender:", senderAddress);
    console.log("Owner:", deployer.address);
    console.log("BSC testnet (97) enabled: true");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 
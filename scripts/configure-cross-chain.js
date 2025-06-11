const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Configuring cross-chain with account:", deployer.address);

    const network = hre.network.name;
    console.log("Current network:", network);

    let senderAddress, targetChainId, targetChainName;
    
    if (network === "sepolia") {
        senderAddress = "0x7E998120D1A91BA1488FCac0e7B5f055827b5873";
        targetChainId = 97; // BSC testnet
        targetChainName = "BSC testnet";
    } else if (network === "bscTestnet") {
        senderAddress = "0x5a5a2d0b7899A5Bef0506B10F001685B28E7F8c9";
        targetChainId = 11155111; // Sepolia
        targetChainName = "Sepolia";
    } else {
        console.error("Unknown network:", network);
        process.exit(1);
    }

    // Get the sender contract
    const messageSender = await ethers.getContractAt("CrossChainMessageSender", senderAddress);
    
    // Check if target chain is already enabled
    const isEnabled = await messageSender.enabledChains(targetChainId);
    console.log(`${targetChainName} (${targetChainId}) enabled:`, isEnabled);
    
    if (!isEnabled) {
        console.log(`Enabling ${targetChainName}...`);
        const tx = await messageSender.enableChain(targetChainId);
        await tx.wait();
        console.log(`${targetChainName} enabled successfully!`);
    } else {
        console.log(`${targetChainName} is already enabled.`);
    }

    // Verify current configuration
    console.log("\nCurrent Configuration:");
    console.log("======================");
    console.log("Sender contract:", senderAddress);
    console.log("Current chain:", network);
    console.log(`${targetChainName} (${targetChainId}) enabled:`, await messageSender.enabledChains(targetChainId));
    console.log("Message counter:", await messageSender.messageCounter());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 
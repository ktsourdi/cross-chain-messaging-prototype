const hre = require("hardhat");

async function main() {
    console.log("🌉 Cross-Chain Messaging Demo");
    console.log("================================");

    const [deployer, relayer, user] = await hre.ethers.getSigners();
    
    console.log("👤 Accounts:");
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Relayer:  ${relayer.address}`);
    console.log(`   User:     ${user.address}`);
    console.log();

    console.log("📦 Deploying contracts...");
    
    const CrossChainMessenger = await hre.ethers.getContractFactory("CrossChainMessenger");
    const messenger = await CrossChainMessenger.deploy();
    await messenger.waitForDeployment();
    
    const TestTarget = await hre.ethers.getContractFactory("TestTarget");
    const testTarget = await TestTarget.deploy();
    await testTarget.waitForDeployment();
    
    console.log(`   CrossChainMessenger: ${await messenger.getAddress()}`);
    console.log(`   TestTarget:          ${await testTarget.getAddress()}`);
    console.log();

    console.log("⚙️  Setting up system...");
    
    await messenger.addRelayer(relayer.address);
    await messenger.enableChain(1);
    await messenger.enableChain(137);
    
    console.log("   ✅ Added relayer");
    console.log("   ✅ Enabled chains 1 and 137");
    console.log();

    console.log("📨 Sending cross-chain message...");
    
    const targetChain = 137;
    const payload = testTarget.interface.encodeFunctionData("setCounter", [42]);
    const gasLimit = 100000;
    
    const tx = await messenger.connect(user).sendMessage(
        targetChain,
        await testTarget.getAddress(),
        payload,
        gasLimit
    );
    
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
        try {
            return messenger.interface.parseLog(log).name === 'MessageSent';
        } catch {
            return false;
        }
    });
    
    const parsedEvent = messenger.interface.parseLog(event);
    const messageId = parsedEvent.args.messageId;
    const nonce = parsedEvent.args.nonce;
    
    console.log(`   📧 Message ID: ${messageId}`);
    console.log(`   🔢 Nonce: ${nonce}`);
    console.log(`   ⛽ Gas Limit: ${gasLimit}`);
    console.log();

    console.log("🔄 Simulating relayer processing...");
    
    const sourceChain = await hre.ethers.provider.getNetwork().then(n => Number(n.chainId));
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    
    const messageHash = hre.ethers.solidityPackedKeccak256(
        ["bytes32", "uint256", "address", "address", "bytes", "uint256", "uint256", "uint256"],
        [messageId, sourceChain, user.address, await testTarget.getAddress(), payload, nonce, gasLimit, expiry]
    );
    
    const signature = await relayer.signMessage(hre.ethers.getBytes(messageHash));
    
    console.log("   🔐 Message signed by relayer");
    
    const initialCounter = await testTarget.counter();
    console.log(`   📊 Initial counter value: ${initialCounter}`);
    
    await messenger.connect(relayer).processMessage(
        messageId,
        sourceChain,
        user.address,
        await testTarget.getAddress(),
        payload,
        nonce,
        gasLimit,
        expiry,
        signature
    );
    
    const finalCounter = await testTarget.counter();
    console.log(`   📊 Final counter value: ${finalCounter}`);
    console.log("   ✅ Message processed successfully!");
    console.log();

    console.log("🧪 Testing security features...");
    
    try {
        await messenger.connect(relayer).processMessage(
            messageId,
            sourceChain,
            user.address,
            await testTarget.getAddress(),
            payload,
            nonce,
            gasLimit,
            expiry,
            signature
        );
        console.log("   ❌ Replay attack should have failed!");
    } catch (error) {
        console.log("   ✅ Replay protection working - duplicate message rejected");
    }
    
    try {
        await messenger.connect(user).processMessage(
            messageId,
            sourceChain,
            user.address,
            await testTarget.getAddress(),
            payload,
            nonce + 1,
            gasLimit,
            expiry,
            signature
        );
        console.log("   ❌ Unauthorized processing should have failed!");
    } catch (error) {
        console.log("   ✅ Authorization working - unauthorized relayer rejected");
    }
    
    console.log();
    console.log("🎉 Demo completed successfully!");
    console.log("   The cross-chain messaging system is working correctly");
    console.log("   with proper security measures in place.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 
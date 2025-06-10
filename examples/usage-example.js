const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Cross-Chain Messaging Example\n");

  const [owner, relayer, user] = await ethers.getSigners();
  console.log("👤 Owner:", owner.address);
  console.log("🔗 Relayer:", relayer.address);
  console.log("👥 User:", user.address);

  console.log("\n📦 Deploying contracts...");
  const CrossChainMessenger = await ethers.getContractFactory("CrossChainMessenger");
  const messenger = await CrossChainMessenger.deploy(owner.address);
  await messenger.waitForDeployment();

  const TestTarget = await ethers.getContractFactory("TestTarget");
  const testTarget = await TestTarget.deploy();
  await testTarget.waitForDeployment();

  console.log("✅ CrossChainMessenger deployed to:", messenger.target);
  console.log("✅ TestTarget deployed to:", testTarget.target);

  console.log("\n⚙️  Setting up system...");
  await messenger.connect(owner).addRelayer(relayer.address);
  await messenger.connect(owner).enableChain(1);
  console.log("✅ Relayer added and chain enabled");

  console.log("\n📨 Creating cross-chain message...");
  const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
  const payload = testTarget.interface.encodeFunctionData("setCounter", [42]);
  
  const message = {
    messageId: ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256"],
        [1, user.address, 1]
      )
    ),
    sourceChainId: 1,
    targetChainId: Number(chainId),
    sender: user.address,
    target: testTarget.target,
    payload: payload,
    nonce: 1,
    timestamp: Math.floor(Date.now() / 1000)
  };

  console.log("🔐 Signing message...");
  const messageHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "uint256", "address", "address", "bytes", "uint256", "uint256"],
      [
        message.messageId,
        message.sourceChainId,
        message.targetChainId,
        message.sender,
        message.target,
        message.payload,
        message.nonce,
        message.timestamp
      ]
    )
  );

  const signature = await relayer.signMessage(ethers.getBytes(messageHash));
  console.log("✅ Message signed by relayer");

  console.log("\n🔄 Processing cross-chain message...");
  const tx = await messenger.processMessage(message, signature);
  const receipt = await tx.wait();
  
  console.log("✅ Message processed successfully!");
  console.log("📊 Gas used:", receipt.gasUsed.toString());

  const counter = await testTarget.counter();
  console.log("🎯 Target contract counter:", counter.toString());

  const isProcessed = await messenger.isMessageProcessed(message.messageId);
  console.log("📋 Message processed:", isProcessed);

  console.log("\n📈 System Statistics:");
  console.log("- Expected nonce for chain 1:", (await messenger.getExpectedNonce(1)).toString());
  console.log("- Is relayer trusted:", await messenger.trustedRelayers(relayer.address));
  console.log("- Is chain 1 supported:", await messenger.supportedChains(1));

  console.log("\n✨ Example completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  }); 
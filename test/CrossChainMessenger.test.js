const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CrossChainMessenger", function () {
  let messenger, testTarget, owner, relayer, sender, unauthorized;

  beforeEach(async function () {
    [owner, relayer, sender, unauthorized] = await ethers.getSigners();

    const CrossChainMessenger = await ethers.getContractFactory("CrossChainMessenger");
    messenger = await CrossChainMessenger.deploy(owner.address);

    const TestTarget = await ethers.getContractFactory("TestTarget");
    testTarget = await TestTarget.deploy();

    await messenger.connect(owner).addRelayer(relayer.address);
    await messenger.connect(owner).enableChain(1);
  });

  describe("Basic functionality", function () {
    it("deploys correctly", async function () {
      expect(await messenger.owner()).to.equal(owner.address);
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      expect(await messenger.supportedChains(chainId)).to.be.true;
    });

    it("manages relayers", async function () {
      await messenger.connect(owner).addRelayer(sender.address);
      expect(await messenger.trustedRelayers(sender.address)).to.be.true;

      await messenger.connect(owner).removeRelayer(sender.address);
      expect(await messenger.trustedRelayers(sender.address)).to.be.false;
    });

    it("rejects invalid relayer operations", async function () {
      await expect(messenger.connect(owner).addRelayer(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid relayer address");

      await expect(messenger.connect(unauthorized).addRelayer(sender.address))
        .to.be.revertedWithCustomError(messenger, "OwnableUnauthorizedAccount");
    });
  });

  describe("Message processing", function () {
    async function createMessage() {
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      const payload = testTarget.interface.encodeFunctionData("setCounter", [42]);
      
      const message = {
        messageId: ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "address", "uint256"],
            [1, sender.address, 1]
          )
        ),
        sourceChainId: 1,
        targetChainId: Number(chainId),
        sender: sender.address,
        target: testTarget.target,
        payload: payload,
        nonce: 1,
        timestamp: Math.floor(Date.now() / 1000)
      };

      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint256", "uint256", "address", "address", "bytes", "uint256", "uint256"],
          [message.messageId, message.sourceChainId, message.targetChainId, 
           message.sender, message.target, message.payload, message.nonce, message.timestamp]
        )
      );

      const signature = await relayer.signMessage(ethers.getBytes(messageHash));
      return { message, signature };
    }

    it("processes valid messages", async function () {
      const { message, signature } = await createMessage();

      await expect(messenger.processMessage(message, signature))
        .to.emit(messenger, "MessageReceived");

      expect(await testTarget.counter()).to.equal(42);
      expect(await messenger.isMessageProcessed(message.messageId)).to.be.true;
    });

    it("prevents unauthorized relayers", async function () {
      const { message } = await createMessage();
      
      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint256", "uint256", "address", "address", "bytes", "uint256", "uint256"],
          [message.messageId, message.sourceChainId, message.targetChainId,
           message.sender, message.target, message.payload, message.nonce, message.timestamp]
        )
      );

      const badSignature = await unauthorized.signMessage(ethers.getBytes(messageHash));

      await expect(messenger.processMessage(message, badSignature))
        .to.be.revertedWithCustomError(messenger, "UnauthorizedRelayer");
    });

    it("prevents replay attacks", async function () {
      const { message, signature } = await createMessage();

      await messenger.processMessage(message, signature);

      await expect(messenger.processMessage(message, signature))
        .to.be.revertedWithCustomError(messenger, "MessageAlreadyProcessed");
    });

    it("validates nonces", async function () {
      const chainId = await ethers.provider.getNetwork().then(n => n.chainId);
      const payload = testTarget.interface.encodeFunctionData("setCounter", [42]);
      
      const message = {
        messageId: ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "address", "uint256"],
            [1, sender.address, 5]
          )
        ),
        sourceChainId: 1,
        targetChainId: Number(chainId),
        sender: sender.address,
        target: testTarget.target,
        payload: payload,
        nonce: 5,
        timestamp: Math.floor(Date.now() / 1000)
      };

      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint256", "uint256", "address", "address", "bytes", "uint256", "uint256"],
          [message.messageId, message.sourceChainId, message.targetChainId,
           message.sender, message.target, message.payload, message.nonce, message.timestamp]
        )
      );

      const signature = await relayer.signMessage(ethers.getBytes(messageHash));

      await expect(messenger.processMessage(message, signature))
        .to.be.revertedWithCustomError(messenger, "InvalidNonce");
    });

    it("validates payload size", async function () {
      const { message } = await createMessage();
      message.payload = "0x" + "00".repeat(10001);

      await expect(messenger.processMessage(message, "0x"))
        .to.be.revertedWithCustomError(messenger, "PayloadTooLarge");
    });
  });

  describe("Utilities", function () {
    it("generates message IDs", async function () {
      const expectedId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "address", "uint256"],
          [1, sender.address, 1]
        )
      );
      
      const actualId = await messenger.generateMessageId(1, sender.address, 1);
      expect(actualId).to.equal(expectedId);
    });

    it("tracks nonces", async function () {
      expect(await messenger.getExpectedNonce(1)).to.equal(1);
    });
  });
}); 
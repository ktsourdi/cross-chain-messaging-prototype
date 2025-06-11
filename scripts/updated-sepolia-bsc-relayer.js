const { ethers } = require("hardhat");
const Web3 = require('web3');

// Contract addresses - UPDATED FOR NEW ARCHITECTURE
const SEPOLIA_SENDER = '0x7E998120D1A91BA1488FCac0e7B5f055827b5873';    // NEW: Sender contract
const SEPOLIA_RECEIVER = '0x4101eF79E648226F2717228C54846bD5c7DF1B0d';  // Receiver contract
const BSC_SENDER = '0x5a5a2d0b7899A5Bef0506B10F001685B28E7F8c9';       // BSC sender
const BSC_RECEIVER = '0x86304b56857fB2DC816719557b8F62DDb716A74D';      // BSC receiver  
const BSC_TEST_TARGET = '0x86304b56857fB2DC816719557b8F62DDb716A74D';   // BSC test target

// RPC URLs
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545';

// Private key for BSC transactions (relayer account)
const RELAYER_PRIVATE_KEY = process.env.PRIVATE_KEY;

// Contract ABIs - UPDATED FOR NEW CONTRACTS
const SENDER_ABI = [
    {
        "anonymous": false,
        "inputs": [
            {"indexed": true, "internalType": "uint256", "name": "messageId", "type": "uint256"},
            {"indexed": true, "internalType": "uint256", "name": "targetChainId", "type": "uint256"},
            {"indexed": true, "internalType": "address", "name": "sender", "type": "address"},
            {"indexed": false, "internalType": "address", "name": "target", "type": "address"},
            {"indexed": false, "internalType": "bytes", "name": "payload", "type": "bytes"},
            {"indexed": false, "internalType": "uint256", "name": "nonce", "type": "uint256"},
            {"indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256"}
        ],
        "name": "MessageSent",
        "type": "event"
    }
];

const RECEIVER_ABI = [
    {
        "inputs": [
            {
                "components": [
                    {"internalType": "uint256", "name": "messageId", "type": "uint256"},
                    {"internalType": "uint256", "name": "sourceChainId", "type": "uint256"},
                    {"internalType": "uint256", "name": "targetChainId", "type": "uint256"},
                    {"internalType": "address", "name": "sender", "type": "address"},
                    {"internalType": "address", "name": "target", "type": "address"},
                    {"internalType": "bytes", "name": "payload", "type": "bytes"},
                    {"internalType": "uint256", "name": "nonce", "type": "uint256"},
                    {"internalType": "uint256", "name": "timestamp", "type": "uint256"}
                ],
                "internalType": "struct CrossChainMessenger.CrossChainMessage",
                "name": "message",
                "type": "tuple"
            },
            {"internalType": "bytes", "name": "signature", "type": "bytes"}
        ],
        "name": "processMessage",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "chainId", "type": "uint256"}
        ],
        "name": "getExpectedNonce",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [
            {"indexed": true, "internalType": "uint256", "name": "messageId", "type": "uint256"},
            {"indexed": true, "internalType": "uint256", "name": "sourceChainId", "type": "uint256"},
            {"indexed": true, "internalType": "address", "name": "sender", "type": "address"},
            {"indexed": false, "internalType": "address", "name": "target", "type": "address"},
            {"indexed": false, "internalType": "bytes", "name": "payload", "type": "bytes"},
            {"indexed": false, "internalType": "uint256", "name": "nonce", "type": "uint256"}
        ],
        "name": "MessageReceived",
        "type": "event"
    }
];

const TEST_TARGET_ABI = [
    {
        "inputs": [],
        "name": "counter",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "storedValue",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
];

class UpdatedSepoliaBSCRelayer {
    constructor() {
        this.sepoliaWeb3 = new Web3(SEPOLIA_RPC);
        this.bscWeb3 = new Web3(BSC_TESTNET_RPC);
        
        // Monitor the SENDER contract for MessageSent events
        this.sepoliaSender = new this.sepoliaWeb3.eth.Contract(SENDER_ABI, SEPOLIA_SENDER);
        // Process messages on the RECEIVER contract
        this.bscReceiver = new this.bscWeb3.eth.Contract(RECEIVER_ABI, BSC_RECEIVER);
        
        // Add relayer account to BSC Web3
        this.bscAccount = this.bscWeb3.eth.accounts.privateKeyToAccount(RELAYER_PRIVATE_KEY);
        this.bscWeb3.eth.accounts.wallet.add(this.bscAccount);
        
        this.processedMessages = new Set();
    }

    async initialize() {
        console.log('🚀 Starting Updated Sepolia → BSC Cross-Chain Relayer...');
        console.log('📡 Monitoring Sepolia MessageSender:', SEPOLIA_SENDER);
        console.log('🌐 Relaying to BSC MessageReceiver:', BSC_RECEIVER);
        
        // Test connections
        try {
            console.log('🔍 Testing Sepolia connection...');
            const sepoliaChainId = await this.sepoliaWeb3.eth.getChainId();
            console.log('✅ Connected to Sepolia, Chain ID:', sepoliaChainId);
        } catch (error) {
            console.error('❌ Cannot connect to Sepolia:', error.message);
            process.exit(1);
        }

        try {
            console.log('🔍 Testing BSC Testnet connection...');
            const bscChainId = await this.bscWeb3.eth.getChainId();
            console.log('✅ Connected to BSC Testnet, Chain ID:', bscChainId);
            
            const balance = await this.bscWeb3.eth.getBalance(this.bscAccount.address);
            console.log('🔑 Relayer account:', this.bscAccount.address);
            console.log('💰 BSC Testnet balance:', this.bscWeb3.utils.fromWei(balance, 'ether'), 'BNB');
            
            if (balance === '0') {
                console.log('⚠️  Warning: Relayer has 0 BNB. Get testnet BNB from https://testnet.binance.org/faucet-smart');
            }
        } catch (error) {
            console.error('❌ Cannot connect to BSC Testnet:', error.message);
            process.exit(1);
        }
        
        await this.startMonitoring();
    }

    async startMonitoring() {
        console.log('👀 Starting to monitor for MessageSent events...');
        
        // Store last checked block
        let lastCheckedBlock = await this.sepoliaWeb3.eth.getBlockNumber();
        console.log(`🔍 Starting from block ${lastCheckedBlock}...`);

        // Check for recent past events first
        try {
            const fromBlock = Math.max(0, lastCheckedBlock - 100);
            console.log(`🔍 Checking for past events from block ${fromBlock} to ${lastCheckedBlock}...`);
            
            const pastEvents = await this.sepoliaSender.getPastEvents('MessageSent', {
                fromBlock: fromBlock,
                toBlock: 'latest'
            });
            
            if (pastEvents.length > 0) {
                console.log(`📦 Found ${pastEvents.length} past message(s), processing...`);
                for (const event of pastEvents) {
                    await this.processMessage(event);
                }
            }
        } catch (error) {
            console.error('❌ Error checking past events:', error);
        }

        console.log('✅ Relayer is now active and monitoring...\n');
        
        // Start polling for new events every 15 seconds
        setInterval(async () => {
            try {
                const currentBlock = await this.sepoliaWeb3.eth.getBlockNumber();
                
                if (currentBlock > lastCheckedBlock) {
                    console.log(`🔍 Checking blocks ${lastCheckedBlock + 1} to ${currentBlock}...`);
                    
                    const newEvents = await this.sepoliaSender.getPastEvents('MessageSent', {
                        fromBlock: lastCheckedBlock + 1,
                        toBlock: currentBlock
                    });
                    
                    if (newEvents.length > 0) {
                        console.log(`📨 Found ${newEvents.length} new message(s)!`);
                        for (const event of newEvents) {
                            await this.processMessage(event);
                        }
                    }
                    
                    lastCheckedBlock = currentBlock;
                }
            } catch (error) {
                console.error('❌ Error polling for events:', error.message);
            }
        }, 15000); // Poll every 15 seconds
    }

    async processMessage(event) {
        const messageId = event.returnValues.messageId;
        const messageKey = `${event.transactionHash}-${messageId}`;
        
        if (this.processedMessages.has(messageKey)) {
            console.log(`⏭️  Message ${messageId} already processed, skipping...`);
            return;
        }

        try {
            console.log('📋 Processing cross-chain message:', {
                messageId: messageId,
                targetChainId: event.returnValues.targetChainId,
                target: event.returnValues.target,
                sender: event.returnValues.sender,
                nonce: event.returnValues.nonce,
                timestamp: event.returnValues.timestamp,
                txHash: event.transactionHash
            });

            // Check if target chain is BSC Testnet (97)
            if (event.returnValues.targetChainId !== '97') {
                console.log(`⏭️  Message targets chain ${event.returnValues.targetChainId}, not BSC Testnet (97), skipping...`);
                return;
            }

            // Get expected nonce for source chain
            const expectedNonce = await this.bscReceiver.methods.getExpectedNonce(11155111).call();
            console.log('🔍 Expected nonce for Sepolia messages:', expectedNonce);

            // Build the message struct for the receiver
            const message = {
                messageId: messageId,
                sourceChainId: 11155111, // Sepolia
                targetChainId: 97, // BSC testnet
                sender: event.returnValues.sender,
                target: event.returnValues.target,
                payload: event.returnValues.payload,
                nonce: expectedNonce,
                timestamp: event.returnValues.timestamp
            };

            // Create message hash for signing
            const messageHash = this.sepoliaWeb3.utils.soliditySha3(
                message.messageId,
                message.sourceChainId,
                message.targetChainId,
                message.sender,
                message.target,
                message.payload,
                message.nonce,
                message.timestamp
            );

            // Sign the message hash
            const signature = this.bscAccount.sign(messageHash);
            
            console.log('🌉 Relaying message to BSC Testnet...');
            
            const gasPrice = await this.bscWeb3.eth.getGasPrice();
            const gasLimit = 500000;
            
            const relayTx = await this.bscReceiver.methods.processMessage(
                message,
                signature.signature
            ).send({
                from: this.bscAccount.address,
                gas: gasLimit,
                gasPrice: gasPrice
            });

            console.log('✅ Message relayed successfully!');
            console.log('📍 BSC transaction hash:', relayTx.transactionHash);
            console.log('🔗 View on BSCScan:', `https://testnet.bscscan.com/tx/${relayTx.transactionHash}`);
            
            // Mark as processed
            this.processedMessages.add(messageKey);
            
            // Check the result on target contract
            await this.checkTargetContractState(event.returnValues.target);
            
        } catch (error) {
            console.error('❌ Error processing message:', error.message);
            if (error.message.includes('insufficient funds')) {
                console.log('💰 Need more BNB! Get testnet BNB from: https://testnet.binance.org/faucet-smart');
            }
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    async checkTargetContractState(targetContractAddress) {
        try {
            if (targetContractAddress.toLowerCase() === BSC_TEST_TARGET.toLowerCase()) {
                const testTarget = new this.bscWeb3.eth.Contract(TEST_TARGET_ABI, BSC_TEST_TARGET);
                
                const counter = await testTarget.methods.counter().call();
                const storedValue = await testTarget.methods.storedValue().call();
                
                console.log('📊 BSC TestTarget contract state updated:');
                console.log('   Counter:', counter.toString());
                console.log('   Stored Value:', storedValue.toString()); 
                console.log('🔗 View contract on BSCScan:', `https://testnet.bscscan.com/address/${BSC_TEST_TARGET}`);
            }
        } catch (error) {
            console.log('⚠️  Could not read target contract state:', error.message);
        }
    }
}

async function main() {
    if (!RELAYER_PRIVATE_KEY) {
        console.error('❌ PRIVATE_KEY not found in environment variables');
        console.error('   Make sure your .env file contains PRIVATE_KEY=your_private_key');
        process.exit(1);
    }

    const relayer = new UpdatedSepoliaBSCRelayer();
    await relayer.initialize();
    
    // Keep the process running
    process.on('SIGINT', () => {
        console.log('\n👋 Shutting down Updated Sepolia → BSC relayer...');
        process.exit(0);
    });
    
    // Keep alive
    console.log('⏰ Press Ctrl+C to stop the relayer');
    setInterval(() => {
        // Heartbeat every 30 seconds
    }, 30000);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { UpdatedSepoliaBSCRelayer }; 
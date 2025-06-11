const { ethers } = require("hardhat");
const Web3 = require('web3');

const SEPOLIA_MESSENGER = '0x3014b38b18ea56F34958702FbAC629594208CEFC';
const HARDHAT_MESSENGER = '0x59b670e9fA9D0A427751Af201D676719a970857b';
const HARDHAT_TEST_TARGET = '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const HARDHAT_RPC = 'http://localhost:8545';

const MESSENGER_ABI = [
    {
        "anonymous": false,
        "inputs": [
            {"indexed": true, "internalType": "uint256", "name": "messageId", "type": "uint256"},
            {"indexed": true, "internalType": "uint256", "name": "targetChainId", "type": "uint256"},
            {"indexed": true, "internalType": "address", "name": "targetContract", "type": "address"},
            {"indexed": false, "internalType": "bytes", "name": "data", "type": "bytes"},
            {"indexed": false, "internalType": "address", "name": "sender", "type": "address"},
            {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"},
            {"indexed": false, "internalType": "uint256", "name": "nonce", "type": "uint256"}
        ],
        "name": "MessageSent",
        "type": "event"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "sourceChainId", "type": "uint256"},
            {"internalType": "uint256", "name": "messageId", "type": "uint256"},
            {"internalType": "address", "name": "targetContract", "type": "address"},
            {"internalType": "bytes", "name": "data", "type": "bytes"},
            {"internalType": "address", "name": "originalSender", "type": "address"},
            {"internalType": "uint256", "name": "value", "type": "uint256"},
            {"internalType": "uint256", "name": "nonce", "type": "uint256"},
            {"internalType": "bytes", "name": "signature", "type": "bytes"}
        ],
        "name": "relayMessage",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    }
];

class CrossChainRelayer {
    constructor() {
        this.sepoliaWeb3 = new Web3(SEPOLIA_RPC);
        this.hardhatWeb3 = new Web3(HARDHAT_RPC);
        
        this.sepoliaMessenger = new this.sepoliaWeb3.eth.Contract(MESSENGER_ABI, SEPOLIA_MESSENGER);
        this.hardhatMessenger = new this.hardhatWeb3.eth.Contract(MESSENGER_ABI, HARDHAT_MESSENGER);
        
        this.processedMessages = new Set();
    }

    async initialize() {
        console.log('🚀 Starting Cross-Chain Relayer...');
        console.log('📡 Monitoring Sepolia →', SEPOLIA_MESSENGER);
        console.log('🏠 Relaying to Hardhat →', HARDHAT_MESSENGER);
        
        // Test Hardhat connection first
        try {
            console.log('🔍 Testing Hardhat connection...');
            const chainId = await this.hardhatWeb3.eth.getChainId();
            console.log('✅ Connected to Hardhat, Chain ID:', chainId);
            
            // Get relayer account for Hardhat
            const accounts = await this.hardhatWeb3.eth.getAccounts();
            this.relayerAccount = accounts[0];
            console.log('🔑 Relayer account:', this.relayerAccount);
            
        } catch (error) {
            console.error('❌ Cannot connect to Hardhat network at http://localhost:8545');
            console.error('   Make sure Hardhat node is running with: npx hardhat node');
            console.error('   Error details:', error.message);
            process.exit(1);
        }
        
        // Test Sepolia connection
        try {
            console.log('🔍 Testing Sepolia connection...');
            const sepoliaChainId = await this.sepoliaWeb3.eth.getChainId();
            console.log('✅ Connected to Sepolia, Chain ID:', sepoliaChainId);
        } catch (error) {
            console.error('❌ Cannot connect to Sepolia network');
            console.error('   Error details:', error.message);
            process.exit(1);
        }
        
        // Start monitoring
        await this.startMonitoring();
    }

    async startMonitoring() {
        console.log('👀 Starting to monitor for MessageSent events...');
        
        // Monitor for new events
        this.sepoliaMessenger.events.MessageSent({
            fromBlock: 'latest'
        })
        .on('data', async (event) => {
            console.log('📨 New message detected on Sepolia!');
            await this.processMessage(event);
        })
        .on('error', (error) => {
            console.error('❌ Event monitoring error:', error);
        });

        // Also check for recent past events (last 100 blocks)
        try {
            const currentBlock = await this.sepoliaWeb3.eth.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 100);
            
            console.log(`🔍 Checking for past events from block ${fromBlock} to ${currentBlock}...`);
            
            const pastEvents = await this.sepoliaMessenger.getPastEvents('MessageSent', {
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
    }

    async processMessage(event) {
        const messageId = event.returnValues.messageId;
        const messageKey = `${event.transactionHash}-${messageId}`;
        
        if (this.processedMessages.has(messageKey)) {
            console.log(`⏭️  Message ${messageId} already processed, skipping...`);
            return;
        }

        try {
            console.log('📋 Processing message:', {
                messageId: messageId,
                targetChainId: event.returnValues.targetChainId,
                targetContract: event.returnValues.targetContract,
                sender: event.returnValues.sender,
                value: event.returnValues.value,
                nonce: event.returnValues.nonce,
                txHash: event.transactionHash
            });

            // Check if target chain is Hardhat (31337)
            if (event.returnValues.targetChainId !== '31337') {
                console.log(`⏭️  Message targets chain ${event.returnValues.targetChainId}, not Hardhat (31337), skipping...`);
                return;
            }

            // Create a simple signature (in production, this would be more secure)
            const messageHash = this.hardhatWeb3.utils.keccak256(
                this.hardhatWeb3.eth.abi.encodeParameters(
                    ['uint256', 'uint256', 'address', 'bytes', 'address', 'uint256', 'uint256'],
                    [
                        11155111, // Sepolia chain ID
                        messageId,
                        event.returnValues.targetContract,
                        event.returnValues.data,
                        event.returnValues.sender,
                        event.returnValues.value,
                        event.returnValues.nonce
                    ]
                )
            );

            // For demo purposes, use a dummy signature
            const dummySignature = '0x' + '00'.repeat(65);

            // Relay the message to Hardhat
            console.log('🌉 Relaying message to Hardhat...');
            
            const relayTx = await this.hardhatMessenger.methods.relayMessage(
                11155111, // Sepolia chain ID
                messageId,
                event.returnValues.targetContract,
                event.returnValues.data,
                event.returnValues.sender,
                event.returnValues.value,
                event.returnValues.nonce,
                dummySignature
            ).send({
                from: this.relayerAccount,
                gas: 500000
            });

            console.log('✅ Message relayed successfully!');
            console.log('📍 Hardhat transaction:', relayTx.transactionHash);
            
            // Mark as processed
            this.processedMessages.add(messageKey);
            
            // Check the result on target contract
            await this.checkTargetContractState(event.returnValues.targetContract);
            
        } catch (error) {
            console.error('❌ Error processing message:', error);
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    async checkTargetContractState(targetContractAddress) {
        try {
            if (targetContractAddress.toLowerCase() === HARDHAT_TEST_TARGET.toLowerCase()) {
                const testTargetABI = [
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
                
                const testTarget = new this.hardhatWeb3.eth.Contract(testTargetABI, HARDHAT_TEST_TARGET);
                
                const counter = await testTarget.methods.counter().call();
                const storedValue = await testTarget.methods.storedValue().call();
                
                console.log('📊 Target contract state updated:');
                console.log('   Counter:', counter.toString());
                console.log('   Stored Value:', storedValue.toString());
            }
        } catch (error) {
            console.log('⚠️  Could not read target contract state:', error.message);
        }
    }
}

async function main() {
    const relayer = new CrossChainRelayer();
    await relayer.initialize();
    
    // Keep the process running
    process.on('SIGINT', () => {
        console.log('\n👋 Shutting down relayer...');
        process.exit(0);
    });
    
    // Keep alive
    setInterval(() => {
        // Heartbeat every 30 seconds
    }, 30000);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { CrossChainRelayer }; 
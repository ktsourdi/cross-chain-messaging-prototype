// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CrossChainMessageSender is Ownable, ReentrancyGuard {
    event MessageSent(
        uint256 indexed messageId,
        uint256 indexed targetChainId,
        address indexed sender,
        address target,
        bytes payload,
        uint256 nonce,
        uint256 timestamp
    );

    struct OutgoingMessage {
        uint256 messageId;
        uint256 sourceChainId;
        uint256 targetChainId;
        address sender;
        address target;
        bytes payload;
        uint256 nonce;
        uint256 timestamp;
    }

    mapping(uint256 => bool) public enabledChains;
    mapping(address => uint256) public senderNonces;
    
    uint256 public messageCounter;
    uint256 public constant MAX_PAYLOAD_SIZE = 10000;

    error UnsupportedChain();
    error PayloadTooLarge();
    error InvalidTargetAddress();

    constructor(address initialOwner) Ownable(initialOwner) {
        // Chain is enabled for itself by default
        enabledChains[block.chainid] = true;
    }

    function enableChain(uint256 chainId) external onlyOwner {
        enabledChains[chainId] = true;
    }

    function disableChain(uint256 chainId) external onlyOwner {
        enabledChains[chainId] = false;
    }

    function sendMessage(
        uint256 targetChainId,
        address target,
        bytes calldata payload
    ) external nonReentrant returns (uint256 messageId) {
        if (!enabledChains[targetChainId]) {
            revert UnsupportedChain();
        }
        
        if (target == address(0)) {
            revert InvalidTargetAddress();
        }
        
        if (payload.length > MAX_PAYLOAD_SIZE) {
            revert PayloadTooLarge();
        }

        // Increment nonce for sender
        senderNonces[msg.sender]++;
        uint256 nonce = senderNonces[msg.sender];
        
        // Generate unique message ID
        messageId = uint256(keccak256(abi.encode(
            block.chainid,
            msg.sender,
            nonce,
            block.timestamp
        )));

        messageCounter++;

        emit MessageSent(
            messageId,
            targetChainId,
            msg.sender,
            target,
            payload,
            nonce,
            block.timestamp
        );

        return messageId;
    }

    function generateMessageHash(
        uint256 messageId,
        uint256 sourceChainId,
        uint256 targetChainId,
        address sender,
        address target,
        bytes calldata payload,
        uint256 nonce,
        uint256 timestamp
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(
            messageId,
            sourceChainId,
            targetChainId,
            sender,
            target,
            payload,
            nonce,
            timestamp
        ));
    }

    function getSenderNonce(address sender) external view returns (uint256) {
        return senderNonces[sender];
    }

    function getTotalMessages() external view returns (uint256) {
        return messageCounter;
    }
} 
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract CrossChainMessenger is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    event MessageReceived(
        uint256 indexed messageId,
        uint256 indexed sourceChainId,
        address indexed sender,
        address target,
        bytes payload,
        uint256 nonce
    );
    
    event MessageExecuted(uint256 indexed messageId, bool success, bytes returnData);
    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    event ChainEnabled(uint256 indexed chainId);
    event ChainDisabled(uint256 indexed chainId);

    struct CrossChainMessage {
        uint256 messageId;
        uint256 sourceChainId;
        uint256 targetChainId;
        address sender;
        address target;
        bytes payload;
        uint256 nonce;
        uint256 timestamp;
    }

    mapping(address => bool) public trustedRelayers;
    mapping(uint256 => bool) public supportedChains;
    mapping(uint256 => bool) public processedMessages;
    mapping(uint256 => uint256) public chainNonces;
    
    uint256 public messageCounter;
    uint256 public constant MAX_PAYLOAD_SIZE = 10000;
    uint256 public constant MESSAGE_VALIDITY_PERIOD = 3600;

    error UnauthorizedRelayer();
    error UnsupportedChain();
    error MessageAlreadyProcessed();
    error InvalidSignature();
    error PayloadTooLarge();
    error MessageExpired();
    error InvalidNonce();
    error CallFailed();

    constructor(address initialOwner) Ownable(initialOwner) {
        supportedChains[block.chainid] = true;
    }

    function addRelayer(address relayer) external onlyOwner {
        require(relayer != address(0), "Invalid relayer address");
        trustedRelayers[relayer] = true;
        emit RelayerAdded(relayer);
    }

    function removeRelayer(address relayer) external onlyOwner {
        trustedRelayers[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    function enableChain(uint256 chainId) external onlyOwner {
        supportedChains[chainId] = true;
        emit ChainEnabled(chainId);
    }

    function disableChain(uint256 chainId) external onlyOwner {
        supportedChains[chainId] = false;
        emit ChainDisabled(chainId);
    }

    function processMessage(
        CrossChainMessage calldata message,
        bytes calldata signature
    ) external nonReentrant {
        _validateMessage(message);

        bytes32 messageHash = _hashMessage(message);
        address signer = messageHash.toEthSignedMessageHash().recover(signature);
        
        if (!trustedRelayers[signer]) {
            revert UnauthorizedRelayer();
        }

        if (processedMessages[message.messageId]) {
            revert MessageAlreadyProcessed();
        }

        if (message.nonce != chainNonces[message.sourceChainId] + 1) {
            revert InvalidNonce();
        }

        processedMessages[message.messageId] = true;
        chainNonces[message.sourceChainId] = message.nonce;

        emit MessageReceived(
            message.messageId,
            message.sourceChainId,
            message.sender,
            message.target,
            message.payload,
            message.nonce
        );

        if (message.target.code.length > 0) {
            _executeMessage(message);
        }
    }

    function _hashMessage(CrossChainMessage calldata message) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            message.messageId,
            message.sourceChainId,
            message.targetChainId,
            message.sender,
            message.target,
            message.payload,
            message.nonce,
            message.timestamp
        ));
    }

    function _validateMessage(CrossChainMessage calldata message) internal view {
        if (!supportedChains[message.sourceChainId]) {
            revert UnsupportedChain();
        }
        
        if (message.targetChainId != block.chainid) {
            revert UnsupportedChain();
        }
        
        if (message.payload.length > MAX_PAYLOAD_SIZE) {
            revert PayloadTooLarge();
        }
        
        if (block.timestamp > message.timestamp + MESSAGE_VALIDITY_PERIOD) {
            revert MessageExpired();
        }
    }

    function _executeMessage(CrossChainMessage calldata message) internal {
        (bool success, bytes memory returnData) = message.target.call(message.payload);
        
        emit MessageExecuted(message.messageId, success, returnData);
        
        if (!success) {
            revert CallFailed();
        }
    }

    function generateMessageId(
        uint256 sourceChainId,
        address sender,
        uint256 nonce
    ) external pure returns (uint256) {
        return uint256(keccak256(abi.encode(sourceChainId, sender, nonce)));
    }

    function getExpectedNonce(uint256 chainId) external view returns (uint256) {
        return chainNonces[chainId] + 1;
    }

    function isMessageProcessed(uint256 messageId) external view returns (bool) {
        return processedMessages[messageId];
    }

    function emergencyMarkProcessed(uint256[] calldata messageIds) external onlyOwner {
        for (uint256 i = 0; i < messageIds.length; i++) {
            processedMessages[messageIds[i]] = true;
        }
    }
} 
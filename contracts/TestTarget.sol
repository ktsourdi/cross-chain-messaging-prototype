// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TestTarget {
    event MessageExecuted(address sender, bytes data, uint256 value);
    event CounterIncremented(uint256 newValue);
    event ValueStored(uint256 value);

    uint256 public counter;
    uint256 public storedValue;
    address public lastSender;
    bytes public lastData;
    bool public shouldRevert;

    function setCounter(uint256 _counter) external {
        counter = _counter;
        lastSender = msg.sender;
        lastData = msg.data;
        emit MessageExecuted(msg.sender, msg.data, 0);
        emit CounterIncremented(_counter);
    }

    function incrementCounter() external {
        counter++;
        lastSender = msg.sender;
        lastData = msg.data;
        emit MessageExecuted(msg.sender, msg.data, 0);
        emit CounterIncremented(counter);
    }

    function storeValue(uint256 _value) external {
        storedValue = _value;
        lastSender = msg.sender;
        lastData = msg.data;
        emit MessageExecuted(msg.sender, msg.data, 0);
        emit ValueStored(_value);
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function revertingFunction() external view {
        require(!shouldRevert, "Function reverted as requested");
    }

    function getLastExecution() external view returns (address, bytes memory) {
        return (lastSender, lastData);
    }
} 
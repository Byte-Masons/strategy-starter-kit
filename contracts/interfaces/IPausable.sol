// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IPausable {
    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() external view returns (bool);
}

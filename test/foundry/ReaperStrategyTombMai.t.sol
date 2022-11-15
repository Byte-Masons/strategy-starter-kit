// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "contracts/ReaperStrategyTombMai.sol";
import "contracts/ReaperVaultv1_4.sol";
import "contracts/test/TestReaperStrategyTombMaiV2.sol";
import "contracts/test/TestReaperStrategyTombMaiV3.sol";
import "oz-contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "oz-contracts/token/ERC20/ERC20.sol";

contract ReaperStrategyTombMaiTest is Test {
    // Fork Identifier
    uint256 public fantomFork;

    // Registry
    address public treasuryAddr = 0x0e7c5313E9BB80b654734d9b7aB1FB01468deE3b;

    address public superAdminAddress = 0x04C710a1E8a738CDf7cAD3a52Ba77A784C35d8CE;
    address public adminAddress = 0x539eF36C804e4D735d8cAb69e8e441c12d4B88E0;
    address public guardianAddress = 0xf20E25f2AB644C8ecBFc992a6829478a85A98F2c;
    address public wantAddress = 0x45f4682B560d4e3B8FF1F1b3A38FDBe775C7177b;
    address public wftmAddress = 0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83;

    address public wantHolderAddr = 0x93a4C7cA8123551ac3FD14D7f7B646DB47b2bb37;
    address public strategistAddr = 0x1A20D7A31e5B3Bc5f02c8A146EF6f394502a10c4;

    address public owner = 0xb4c79daB8f259C7Aee6E5b2Aa729821864227e84;

    address[] public strategists = [strategistAddr];
    address[] public multisigRoles = [superAdminAddress, adminAddress, guardianAddress];

    // Initialized during set up in initial tests
    // vault, strategy, want, wftm, owner, wantHolder, strategist, guardian, admin, superAdmin, unassignedRole
    ReaperVaultv1_4 public vault;
    string public vaultName = "TOMB-MAI Tomb Crypt";
    string public vaultSymbol = "rf-TOMB-MAI";
    uint256 public vaultFee = 0;
    uint256 public vaultTvlCap = type(uint256).max;

    ReaperStrategyTombMai public implementation;
    ERC1967Proxy public proxy;
    ReaperStrategyTombMai public wrappedProxy;

    TestReaperStrategyTombMaiV2 public implementationV2;
    TestReaperStrategyTombMaiV3 public implementationV3;

    ERC20 public want = ERC20(wantAddress);
    ERC20 public wftm = ERC20(wftmAddress);

    function setUp() public {
        // Forking
        fantomFork = vm.createSelectFork("https://rpcapi-tracing.fantom.network", 37100223);
        assertEq(vm.activeFork(), fantomFork);

        // Deploying stuff
        vault = new ReaperVaultv1_4(wantAddress, vaultName, vaultSymbol, vaultFee, vaultTvlCap);
        implementation = new ReaperStrategyTombMai();
        proxy = new ERC1967Proxy(address(implementation), "");
        wrappedProxy = ReaperStrategyTombMai(address(proxy));
        wrappedProxy.initialize(address(vault), treasuryAddr, strategists, multisigRoles);
        vault.initialize(address(proxy));

        implementationV2 = new TestReaperStrategyTombMaiV2();
        implementationV3 = new TestReaperStrategyTombMaiV3();

        vm.prank(wantHolderAddr);
        want.approve(address(vault), type(uint256).max);
    }

    ///------ DEPLOYMENT ------\\\\

    function testVaultDeployedWith0Balance() public {
        uint256 totalBalance = vault.balance();
        uint256 availableBalance = vault.available();
        uint256 pricePerFullShare = vault.getPricePerFullShare();
        assertEq(totalBalance, 0);
        assertEq(availableBalance, 0);
        assertEq(pricePerFullShare, 1e18);
    }

    function testCannotUpgradeWithoutInitiatingCooldown() public {
        vm.expectRevert();
        wrappedProxy.upgradeTo(address(implementationV2));
    }

    function testCannotUpgradeBeforeTimelockPassed() public {
        wrappedProxy.initiateUpgradeCooldown();

        vm.expectRevert();
        wrappedProxy.upgradeTo(address(implementationV2));
    }

    function testCanUpgradeOnceTimelockPassed() public {
        uint256 timeToSkip = wrappedProxy.UPGRADE_TIMELOCK() + 10;
        wrappedProxy.initiateUpgradeCooldown();
        skip(timeToSkip);
        wrappedProxy.upgradeTo(address(implementationV2));
    }

    function testSuccessiveUpgradesNeedToInitiateTimelockAgain() public {
        uint256 timeToSkip = wrappedProxy.UPGRADE_TIMELOCK() + 10;
        wrappedProxy.initiateUpgradeCooldown();
        skip(timeToSkip);
        wrappedProxy.upgradeTo(address(implementationV2));

        vm.expectRevert();
        wrappedProxy.upgradeTo(address(implementationV3));

        wrappedProxy.initiateUpgradeCooldown();
        vm.expectRevert();
        wrappedProxy.upgradeTo(address(implementationV3));

        skip(timeToSkip);
        wrappedProxy.upgradeTo(address(implementationV3));
    }

    ///------ ACCESS CONTROL ------\\\

    function testUnassignedRoleCannotPassAccessControl() public {
        vm.expectRevert("Unauthorized access");
        vm.startPrank(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266); // random address
        wrappedProxy.updateHarvestLogCadence(10);

        vm.expectRevert("Unauthorized access");
        wrappedProxy.pause();

        vm.expectRevert("Unauthorized access");
        wrappedProxy.unpause();

        vm.expectRevert("Unauthorized access");
        wrappedProxy.updateSecurityFee(0);
    }

    function testStrategistHasRightPrivileges() public {
        vm.startPrank(strategistAddr);

        wrappedProxy.updateHarvestLogCadence(10);

        vm.expectRevert("Unauthorized access");
        wrappedProxy.pause();

        vm.expectRevert("Unauthorized access");
        wrappedProxy.unpause();

        vm.expectRevert("Unauthorized access");
        wrappedProxy.updateSecurityFee(0);
    }

    function testGuardianHasRightPrivilieges() public {
        vm.startPrank(guardianAddress);

        wrappedProxy.updateHarvestLogCadence(10);

        wrappedProxy.pause();

        vm.expectRevert("Unauthorized access");
        wrappedProxy.unpause();

        vm.expectRevert("Unauthorized access");
        wrappedProxy.updateSecurityFee(0);
    }

    function testAdminHasRightPrivileges() public {
        vm.startPrank(adminAddress);

        wrappedProxy.updateHarvestLogCadence(10);

        wrappedProxy.pause();

        wrappedProxy.unpause();

        vm.expectRevert("Unauthorized access");
        wrappedProxy.updateSecurityFee(0);
    }

    function testSuperAdminOrOwnerHasRightPrivileges() public {
        vm.startPrank(superAdminAddress);

        wrappedProxy.updateHarvestLogCadence(10);

        wrappedProxy.pause();

        wrappedProxy.unpause();

        wrappedProxy.updateSecurityFee(0);
    }

    ///------ VAULT AND STRATEGY------\\\

    function testCanTakeDeposits() public {
        vm.startPrank(wantHolderAddr);
        uint256 depositAmount = (want.balanceOf(wantHolderAddr) * 2000) / 10000;
        vault.deposit(depositAmount);

        uint256 newVaultBalance = vault.balance();
        assertApproxEqRel(newVaultBalance, depositAmount, 0.005e18);
    }

    function testVaultCanMintUserPoolShare() public {
        vm.startPrank(wantHolderAddr);
        uint256 depositAmount = (want.balanceOf(wantHolderAddr) * 2000) / 10000;
        vault.deposit(depositAmount);

        uint256 ownerDepositAmount = (want.balanceOf(wantHolderAddr) * 5000) / 10000;
        want.transfer(owner, ownerDepositAmount);
        vm.stopPrank();
        want.approve(address(vault), ownerDepositAmount);
        vault.deposit(ownerDepositAmount);

        uint256 allowedImprecision = 1e15;

        uint256 userVaultBalance = vault.balanceOf(wantHolderAddr);
        assertApproxEqRel(userVaultBalance, depositAmount, allowedImprecision);
        uint256 ownerVaultBalance = vault.balanceOf(owner);
        assertApproxEqRel(ownerVaultBalance, ownerDepositAmount, allowedImprecision);

        vault.withdrawAll();
        uint256 ownerWantBalance = want.balanceOf(owner);
        assertApproxEqRel(ownerWantBalance, ownerDepositAmount, allowedImprecision);
        ownerVaultBalance = vault.balanceOf(owner);
        assertEq(ownerVaultBalance, 0);
    }

    function testVaultAllowsWithdrawals() public {
        uint256 userBalance = want.balanceOf(wantHolderAddr);
        uint256 depositAmount = (want.balanceOf(wantHolderAddr) * 5000) / 10000;
        vm.startPrank(wantHolderAddr);
        vault.deposit(depositAmount);
        vault.withdrawAll();
        uint256 userBalanceAfterWithdraw = want.balanceOf(wantHolderAddr);

        uint256 securityFee = 10;
        uint256 percentDivisor = 10000;
        uint256 withdrawFee = (depositAmount * securityFee) / percentDivisor;
        uint256 expectedBalance = userBalance - withdrawFee;
        uint256 smallDifference = expectedBalance / 200;
        bool isSmallBalanceDifference = (expectedBalance - userBalanceAfterWithdraw) < smallDifference;
        assertEq(isSmallBalanceDifference, true);
    }

    function testVaultAllowsSmallWithdrawal() public {
        vm.startPrank(wantHolderAddr);
        uint256 ownerDepositAmount = (want.balanceOf(wantHolderAddr) * 1000) / 10000;
        want.transfer(owner, ownerDepositAmount);

        uint256 userBalance = want.balanceOf(wantHolderAddr);
        uint256 depositAmount = (want.balanceOf(wantHolderAddr) * 100) / 10000;
        vault.deposit(depositAmount);

        vm.stopPrank();
        want.approve(address(vault), type(uint256).max);
        vault.deposit(ownerDepositAmount);

        vm.prank(wantHolderAddr);
        vault.withdrawAll();
        uint256 userBalanceAfterWithdraw = want.balanceOf(wantHolderAddr);

        uint256 securityFee = 10;
        uint256 percentDivisor = 10000;
        uint256 withdrawFee = (depositAmount * securityFee) / percentDivisor;
        uint256 expectedBalance = userBalance - withdrawFee;
        uint256 smallDifference = expectedBalance / 200;
        bool isSmallBalanceDifference = (expectedBalance - userBalanceAfterWithdraw) < smallDifference;
        assertEq(isSmallBalanceDifference, true);
    }

    function testVaultHandlesSmallDepositAndWithdraw() public {
        uint256 userBalance = want.balanceOf(wantHolderAddr);
        uint256 depositAmount = (want.balanceOf(wantHolderAddr) * 10) / 10000;
        vm.startPrank(wantHolderAddr);
        vault.deposit(depositAmount);

        vault.withdraw(depositAmount);
        uint256 userBalanceAfterWithdraw = want.balanceOf(wantHolderAddr);

        uint256 securityFee = 10;
        uint256 percentDivisor = 10000;
        uint256 withdrawFee = (depositAmount * securityFee) / percentDivisor;
        uint256 expectedBalance = userBalance - withdrawFee;
        bool isSmallBalanceDifference = (expectedBalance - userBalanceAfterWithdraw) < 200;
        assertEq(isSmallBalanceDifference, true);
    }

    function testCanHarvest() public {
        uint256 timeToSkip = 3600;
        vm.startPrank(wantHolderAddr);
        vault.deposit(1e21);
        skip(timeToSkip);

        uint256 wftmBalBefore = wftm.balanceOf(wantHolderAddr);
        wrappedProxy.harvest();
        uint256 wftmBalAfter = wftm.balanceOf(wantHolderAddr);
        uint256 wftmBalDiff = wftmBalAfter - wftmBalBefore;
        assertEq(wftmBalDiff > 0, true);
    }

    function testCanProvideYield() public {
        uint256 timeToSkip = 3600;
        uint256 depositAmount = (want.balanceOf(wantHolderAddr) * 1000) / 10000;

        vm.prank(wantHolderAddr);
        vault.deposit(depositAmount);
        uint256 initialVaultBalance = vault.balance();

        wrappedProxy.updateHarvestLogCadence(timeToSkip / 2);
        uint256 numHarvests = 5;

        for (uint256 i; i < numHarvests; i++) {
            skip(timeToSkip);
            wrappedProxy.harvest();
        }

        uint256 finalVaultBalance = vault.balance();
        assertEq(finalVaultBalance > initialVaultBalance, true);

        int256 averageAPR = wrappedProxy.averageAPRAcrossLastNHarvests(int256(numHarvests));
        emit log_named_int("Average APR across numHarvests harvests is ", averageAPR);
    }

    function testCanPauseAndUnpauseStrategy() public {
        wrappedProxy.pause();
        uint256 depositAmount = (want.balanceOf(wantHolderAddr) * 5000) / 10000;
        vm.prank(wantHolderAddr);
        vm.expectRevert("Pausable: paused");
        vault.deposit(depositAmount);

        wrappedProxy.unpause();
        vm.prank(wantHolderAddr);
        vault.deposit(depositAmount);
    }

    function testCanPanic() public {
        uint256 depositAmount = (want.balanceOf(wantHolderAddr) * 5000) / 10000;
        vm.prank(wantHolderAddr);
        vault.deposit(depositAmount);
        uint256 strategyBalance = wrappedProxy.balanceOf();
        wrappedProxy.panic();

        uint256 wantStratBalance = want.balanceOf(address(wrappedProxy));
        uint256 allowedImprecision = 1e9;
        assertApproxEqRel(wantStratBalance, strategyBalance, allowedImprecision);
    }
}

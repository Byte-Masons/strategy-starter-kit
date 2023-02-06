const {time, loadFixture, mine} = require('@nomicfoundation/hardhat-network-helpers');
const {ethers, network, upgrades} = require('hardhat');
const {expect} = require('chai');

// eslint-disable-next-line no-unused-vars
const moveTimeForward = async (seconds) => {
  await time.increase(seconds);
};

// eslint-disable-next-line no-unused-vars
const moveBlocksForward = async (blocks) => {
  mine(blocks);
};

const toWantUnit = (num, isUSDC = false) => {
  if (isUSDC) {
    return ethers.BigNumber.from(num * 10 ** 8);
  }
  return ethers.utils.parseEther(num);
};

const treasuryAddr = '0x0e7c5313E9BB80b654734d9b7aB1FB01468deE3b';

const superAdminAddress = '0x04C710a1E8a738CDf7cAD3a52Ba77A784C35d8CE';
const adminAddress = '0x539eF36C804e4D735d8cAb69e8e441c12d4B88E0';
const guardianAddress = '0xf20E25f2AB644C8ecBFc992a6829478a85A98F2c';
const wantAddress = '0x45f4682B560d4e3B8FF1F1b3A38FDBe775C7177b';
const wftmAddress = '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83';

const wantHolderAddr = '0x93a4C7cA8123551ac3FD14D7f7B646DB47b2bb37';
const strategistAddr = '0x1A20D7A31e5B3Bc5f02c8A146EF6f394502a10c4';

const strategists = [strategistAddr];
const multisigRoles = [superAdminAddress, adminAddress, guardianAddress];

const keepers = [
  '0xe0268Aa6d55FfE1AA7A77587e56784e5b29004A2',
  '0x34Df14D42988e4Dc622e37dc318e70429336B6c5',
  '0x73C882796Ea481fe0A2B8DE499d95e60ff971663',
  '0x36a63324edFc157bE22CF63A6Bf1C3B49a0E72C0',
  '0x9a2AdcbFb972e0EC2946A342f46895702930064F',
  '0x7B540a4D24C906E5fB3d3EcD0Bb7B1aEd3823897',
  '0x8456a746e09A18F9187E5babEe6C60211CA728D1',
  '0x55a078AFC2e20C8c20d1aa4420710d827Ee494d4',
  '0x5241F63D0C1f2970c45234a0F5b345036117E3C2',
  '0xf58d534290Ce9fc4Ea639B8b9eE238Fe83d2efA6',
  '0x5318250BD0b44D1740f47a5b6BE4F7fD5042682D',
  '0x33D6cB7E91C62Dd6980F16D61e0cfae082CaBFCA',
  '0x51263D56ec81B5e823e34d7665A1F505C327b014',
  '0x87A5AfC8cdDa71B5054C698366E97DB2F3C2BC2f',
];

describe('Vaults', function () {
  async function deployVaultAndStrategyAndGetSigners() {
    // reset network
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: 'https://rpcapi-tracing.fantom.network/',
            blockNumber: 37100223,
          },
        },
      ],
    });

    // get signers
    const [owner, unassignedRole] = await ethers.getSigners();
    const wantHolder = await ethers.getImpersonatedSigner(wantHolderAddr);
    const strategist = await ethers.getImpersonatedSigner(strategistAddr);
    const guardian = await ethers.getImpersonatedSigner(guardianAddress);
    const admin = await ethers.getImpersonatedSigner(adminAddress);
    const superAdmin = await ethers.getImpersonatedSigner(superAdminAddress);

    // get artifacts
    const Vault = await ethers.getContractFactory('ReaperVaultv1_5_ERC4626');
    const Strategy = await ethers.getContractFactory('ReaperStrategyTombMai');
    const Want = await ethers.getContractFactory('ERC20');

    // deploy contracts
    const vault = await Vault.deploy(wantAddress, 'TOMB-MAI Tomb Crypt', 'rf-TOMB-MAI', ethers.constants.MaxUint256);
    const strategy = await upgrades.deployProxy(
      Strategy,
      [vault.address, treasuryAddr, strategists, multisigRoles, keepers],
      {kind: 'uups'},
    );
    await strategy.deployed();
    await vault.initialize(strategy.address);
    const want = await Want.attach(wantAddress);
    const wftm = await Want.attach(wftmAddress);

    // approving LP token and vault share spend
    await want.connect(wantHolder).approve(vault.address, ethers.constants.MaxUint256);

    return {vault, strategy, want, wftm, owner, wantHolder, strategist, guardian, admin, superAdmin, unassignedRole};
  }

  describe('ERC4626 compliance', function () {
    it('should be able to convert assets in to amount of shares', async function () {
      const {vault, want, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      const depositAmount = toWantUnit('10');
      let shares = await vault.connect(wantHolder).convertToShares(depositAmount);
      expect(shares).to.equal(depositAmount);
      await vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, wantHolderAddr);

      let totalAssets = await vault.totalAssets();
      console.log(`totalAssets: ${totalAssets}`);
      // Modify the price per share to not be 1 to 1
      await want.connect(wantHolder).transfer(vault.address, toWantUnit('13'));
      totalAssets = await vault.totalAssets();
      console.log(`totalAssets: ${totalAssets}`);

      await want.connect(wantHolder).transfer(owner.address, depositAmount);
      await want.connect(owner).approve(vault.address, ethers.constants.MaxUint256);
      shares = await vault.connect(owner).convertToShares(depositAmount);
      await vault.connect(owner)['deposit(uint256,address)'](depositAmount, owner.address);
      console.log(`shares: ${shares}`);

      const vaultBalance = await vault.balanceOf(owner.address);
      console.log(`vaultBalance: ${vaultBalance}`);
      expect(shares).to.equal(vaultBalance);
    });

    it('should be able to convert shares in to amount of assets', async function () {
      const {vault, want, wantHolder} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      const shareAmount = toWantUnit('10');
      let assets = await vault.convertToAssets(shareAmount);
      expect(assets).to.equal(shareAmount);
      console.log(`assets: ${assets}`);

      const depositAmount = toWantUnit('17');
      await vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, wantHolderAddr);
      await want.connect(wantHolder).transfer(vault.address, depositAmount);

      assets = await vault.convertToAssets(shareAmount);
      console.log(`assets: ${assets}`);
      expect(assets).to.equal(shareAmount.mul(2));
    });

    it('maxDeposit returns the maximum amount of assets that can be deposited', async function () {
      const {vault, strategy, wantHolder, strategist, guardian} = await loadFixture(
        deployVaultAndStrategyAndGetSigners,
      );
      // no tvlCap initially
      let maxDeposit = await vault.maxDeposit(wantHolderAddr);
      expect(maxDeposit).to.equal(ethers.BigNumber.from(2).pow(256).sub(1));

      let tvlCap = toWantUnit('75');
      await vault.updateTvlCap(tvlCap);
      maxDeposit = await vault.maxDeposit(wantHolderAddr);
      expect(maxDeposit).to.equal(tvlCap);

      const depositAmount = toWantUnit('25');
      await vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, wantHolderAddr);
      maxDeposit = await vault.maxDeposit(wantHolderAddr);
      expect(maxDeposit).to.equal(tvlCap.sub(depositAmount));

      tvlCap = toWantUnit('10');
      await vault.updateTvlCap(tvlCap);
      maxDeposit = await vault.maxDeposit(wantHolderAddr);
      expect(maxDeposit).to.equal(0);

      tvlCap = toWantUnit('100');
      await vault.updateTvlCap(tvlCap);
      await vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, wantHolderAddr);
      maxDeposit = await vault.maxDeposit(wantHolderAddr);
      expect(maxDeposit).to.equal(toWantUnit('50'));

      // pause strategy
      const tx = await strategist.sendTransaction({
        to: guardianAddress,
        value: ethers.utils.parseEther('1.0'),
      });
      await tx.wait();
      await strategy.connect(guardian).pause();
      maxDeposit = await vault.maxDeposit(wantHolderAddr);
      expect(maxDeposit).to.equal(0);
    });

    it('previewDeposit returns the number of shares that would be minted on deposit', async function () {
      const {vault, want, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      const depositAmount = toWantUnit('10');
      let previewShares = await vault.previewDeposit(depositAmount);
      const userSharesBefore = await vault.balanceOf(wantHolderAddr);
      await vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, wantHolderAddr);
      const userSharesAfter = await vault.balanceOf(wantHolderAddr);
      const userSharesMinted = userSharesAfter.sub(userSharesBefore);
      expect(userSharesMinted).to.equal(previewShares);

      // change price per share
      await want.connect(wantHolder).transfer(vault.address, toWantUnit('17'));

      // owner is now going to deposit
      const ownerDepositAmount = toWantUnit('13');
      await want.connect(wantHolder).transfer(owner.address, ownerDepositAmount);
      await want.connect(owner).approve(vault.address, ethers.constants.MaxUint256);

      previewShares = await vault.previewDeposit(ownerDepositAmount);
      const ownerSharesBefore = await vault.balanceOf(owner.address);
      await vault.connect(owner)['deposit(uint256,address)'](ownerDepositAmount, owner.address);
      const ownerSharesAfter = await vault.balanceOf(owner.address);
      const ownerSharesMinted = ownerSharesAfter.sub(ownerSharesBefore);
      expect(ownerSharesMinted).to.equal(previewShares);
    });

    it('4626 deposit for self issues shares to self and emits Deposit event', async function () {
      const {vault, wantHolder} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      const userSharesBefore = await vault.balanceOf(wantHolderAddr);
      const depositAmount = toWantUnit('10');
      await expect(vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, wantHolderAddr))
        .to.emit(vault, 'Deposit')
        .withArgs(wantHolderAddr, wantHolderAddr, toWantUnit('10'), toWantUnit('10'));
      const userSharesAfter = await vault.balanceOf(wantHolderAddr);
      const userSharesMinted = userSharesAfter.sub(userSharesBefore);
      expect(userSharesMinted).to.equal(toWantUnit('10'));
    });

    it('4626 deposit for other issues shares to other and emits Deposit event', async function () {
      const {vault, want, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      // have wantHolder first deposit for self
      await vault.connect(wantHolder)['deposit(uint256,address)'](toWantUnit('10'), wantHolderAddr);

      // send some assets to change share price
      await want.connect(wantHolder).transfer(vault.address, toWantUnit('10'));
      // new share price is 2.0

      const ownerSharesBefore = await vault.balanceOf(owner.address);
      const depositAmount = toWantUnit('10');
      await expect(vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, owner.address))
        .to.emit(vault, 'Deposit')
        .withArgs(wantHolderAddr, owner.address, depositAmount, toWantUnit('5'));
      const ownerSharesAfter = await vault.balanceOf(owner.address);
      const ownerSharesMinted = ownerSharesAfter.sub(ownerSharesBefore);
      expect(ownerSharesMinted).to.equal(toWantUnit('5'));
    });

    it('maxMint returns the maximum amount of shares that can be deposited', async function () {
      const {vault, strategy, want, wantHolder, strategist, admin} = await loadFixture(
        deployVaultAndStrategyAndGetSigners,
      );
      // no tvlCap initially
      let maxMint = await vault.maxMint(wantHolderAddr);
      expect(maxMint).to.equal(ethers.BigNumber.from(2).pow(256).sub(1));

      let tvlCap = toWantUnit('77');
      await vault.updateTvlCap(tvlCap);
      maxMint = await vault.maxMint(wantHolderAddr);
      expect(maxMint).to.equal(tvlCap); // since share price is 1:1 initially

      const depositAmount = toWantUnit('25');
      await vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, wantHolderAddr);
      maxMint = await vault.maxMint(wantHolderAddr);
      expect(maxMint).to.equal(tvlCap.sub(depositAmount)); // since share price is still 1:1

      // send some assets to change share price
      await want.connect(wantHolder).transfer(vault.address, toWantUnit('10'));
      // new assets = 25 + 10 = 35
      // total shares is still 25
      // so new share price is 35 / 25 = 1.4
      // deposit room left is 77 - 35 = 42

      maxMint = await vault.maxMint(wantHolderAddr);
      expect(maxMint).to.equal(toWantUnit('30')); // since share price is now 1.4

      // pause strategy
      const tx = await strategist.sendTransaction({
        to: adminAddress,
        value: ethers.utils.parseEther('1.0'),
      });
      await tx.wait();
      await strategy.connect(admin).pause();
      maxMint = await vault.maxMint(wantHolderAddr);
      expect(maxMint).to.equal(0);

      // unpause
      await strategy.connect(admin).unpause();
      maxMint = await vault.maxMint(wantHolderAddr);
      expect(maxMint).to.equal(toWantUnit('30'));

      tvlCap = toWantUnit('10');
      await vault.updateTvlCap(tvlCap);
      maxMint = await vault.maxMint(wantHolderAddr);
      expect(maxMint).to.equal(0);
    });

    it('previewMint returns the amount of asset taken on a mint', async function () {
      const {vault, want, wantHolder} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      let mintAmount = toWantUnit('50');
      let mintPreview = await vault.connect(wantHolder).previewMint(mintAmount);
      expect(mintPreview).to.equal(mintAmount);

      let userBalance = await want.balanceOf(wantHolderAddr);
      await vault.connect(wantHolder).mint(mintAmount, wantHolderAddr);
      let userBalanceAfterMint = await want.balanceOf(wantHolderAddr);
      expect(userBalanceAfterMint).to.equal(userBalance.sub(mintPreview));

      // Change the price per share
      // assets = 50 + 20 = 70
      // shares = 50
      // share price = 70 / 50 = 1.4
      const transferAmount = toWantUnit('20');
      await want.connect(wantHolder).transfer(vault.address, transferAmount);

      mintAmount = toWantUnit('13');
      mintPreview = await vault.connect(wantHolder).previewMint(mintAmount);
      expect(mintPreview).to.equal(toWantUnit('18.2'));
      userBalance = await want.balanceOf(wantHolderAddr);
      await vault.connect(wantHolder).mint(mintAmount, wantHolderAddr);
      userBalanceAfterMint = await want.balanceOf(wantHolderAddr);
      expect(userBalanceAfterMint).to.equal(userBalance.sub(mintPreview));
    });

    it('4626 mint for self issues shares to self and emits Deposit event', async function () {
      const {vault, wantHolder} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      const userSharesBefore = await vault.balanceOf(wantHolderAddr);
      const mintAmount = toWantUnit('10');
      await expect(vault.connect(wantHolder).mint(mintAmount, wantHolderAddr))
        .to.emit(vault, 'Deposit')
        .withArgs(wantHolderAddr, wantHolderAddr, toWantUnit('10'), toWantUnit('10'));
      const userSharesAfter = await vault.balanceOf(wantHolderAddr);
      const userSharesMinted = userSharesAfter.sub(userSharesBefore);
      expect(userSharesMinted).to.equal(toWantUnit('10'));
    });

    it('4626 mint for other issues shares to other and emits Deposit event', async function () {
      const {vault, want, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      // have wantHolder first mint for self
      await vault.connect(wantHolder).mint(toWantUnit('10'), wantHolderAddr);

      // send some assets to change share price
      await want.connect(wantHolder).transfer(vault.address, toWantUnit('10'));
      // new share price is 2.0

      const ownerSharesBefore = await vault.balanceOf(owner.address);
      const mintAmount = toWantUnit('10');
      await expect(vault.connect(wantHolder).mint(mintAmount, owner.address))
        .to.emit(vault, 'Deposit')
        .withArgs(wantHolderAddr, owner.address, toWantUnit('20'), mintAmount);
      const ownerSharesAfter = await vault.balanceOf(owner.address);
      const ownerSharesMinted = ownerSharesAfter.sub(ownerSharesBefore);
      expect(ownerSharesMinted).to.equal(mintAmount);
    });

    it('maxWithdraw returns the maximum amount of assets that can be withdrawn', async function () {
      const {vault, want, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      // no deposits initially
      let maxWithdraw = await vault.maxWithdraw(wantHolderAddr);
      expect(maxWithdraw).to.equal(0);

      // deposit some for self
      const depositAmount = toWantUnit('25');
      await vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, wantHolderAddr);
      maxWithdraw = await vault.maxWithdraw(wantHolderAddr);
      expect(maxWithdraw).to.equal(toWantUnit('25'));

      // send some assets to change share price
      await want.connect(wantHolder).transfer(vault.address, toWantUnit('10'));
      // new assets = 25 + 10 = 35
      // total shares is still 25
      // so new share price is 35 / 25 = 1.4
      maxWithdraw = await vault.maxWithdraw(wantHolderAddr);
      expect(maxWithdraw).to.equal(toWantUnit('35')); // 25 shares * 1.4 ppfs

      // mint some for owner
      const mintAmount = toWantUnit('5');
      await vault.connect(wantHolder).mint(mintAmount, owner.address);
      maxWithdraw = await vault.maxWithdraw(wantHolderAddr);
      expect(maxWithdraw).to.equal(toWantUnit('35')); // 25 shares * 1.4 ppfs
      maxWithdraw = await vault.maxWithdraw(owner.address);
      expect(maxWithdraw).to.equal(toWantUnit('7')); // 5 shares * 1.4 ppfs
    });

    it('previewWithdraw returns the amount of shares burned on withdraw', async function () {
      const {vault, want, wantHolder} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      let withdrawAmount = toWantUnit('50');
      let withdrawPreview = await vault.connect(wantHolder).previewWithdraw(withdrawAmount);
      expect(withdrawPreview).to.equal(0);

      await vault.connect(wantHolder)['deposit(uint256,address)'](withdrawAmount, wantHolderAddr);
      withdrawPreview = await vault.connect(wantHolder).previewWithdraw(withdrawAmount);
      expect(withdrawPreview).to.equal(withdrawAmount); // since share price is 1

      // Change the price per share
      // assets = 50 + 20 = 70
      // shares = 50
      // share price = 70 / 50 = 1.4
      const transferAmount = toWantUnit('20');
      await want.connect(wantHolder).transfer(vault.address, transferAmount);

      withdrawAmount = toWantUnit('14');
      withdrawPreview = await vault.connect(wantHolder).previewWithdraw(withdrawAmount);
      expect(withdrawPreview).to.equal(toWantUnit('10'));

      const userVaultBalance = await vault.balanceOf(wantHolderAddr);
      await vault
        .connect(wantHolder)
        ['withdraw(uint256,address,address)'](withdrawAmount, wantHolderAddr, wantHolderAddr);
      const userVaultBalanceAfterWithdraw = await vault.balanceOf(wantHolderAddr);
      expect(userVaultBalanceAfterWithdraw).to.equal(userVaultBalance.sub(toWantUnit('10')));
    });

    it('4626 withdraw to self emits withdraw event', async function () {
      const {vault, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      // first mint to self
      const mintAmount = toWantUnit('10');
      await vault.connect(wantHolder).mint(mintAmount, wantHolderAddr);

      const userSharesBefore = await vault.balanceOf(wantHolderAddr);
      await expect(
        vault.connect(wantHolder)['withdraw(uint256,address,address)'](mintAmount, wantHolderAddr, wantHolderAddr),
      )
        .to.emit(vault, 'Withdraw')
        .withArgs(wantHolderAddr, wantHolderAddr, wantHolderAddr, mintAmount, mintAmount);
      const userSharesAfter = await vault.balanceOf(wantHolderAddr);
      const userSharesBurned = userSharesBefore.sub(userSharesAfter);
      expect(userSharesBurned).to.equal(mintAmount);

      // then try minting to other and withdrawing without allowance (should revert)
      await vault.connect(wantHolder).mint(mintAmount, owner.address);

      await expect(
        vault.connect(wantHolder)['withdraw(uint256,address,address)'](mintAmount, wantHolderAddr, owner.address),
      ).to.be.reverted;

      // have owner give allowance and then try withdrawing, shouldn't revert
      await vault.connect(owner).approve(wantHolderAddr, mintAmount);
      await expect(
        vault.connect(wantHolder)['withdraw(uint256,address,address)'](mintAmount, wantHolderAddr, owner.address),
      )
        .to.emit(vault, 'Withdraw')
        .withArgs(wantHolderAddr, wantHolderAddr, owner.address, mintAmount, mintAmount);
    });

    it('4626 withdraw to other emits withdraw event', async function () {
      const {vault, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      // first mint to self
      const mintAmount = toWantUnit('10');
      await vault.connect(wantHolder).mint(mintAmount, wantHolderAddr);

      const userSharesBefore = await vault.balanceOf(wantHolderAddr);
      await expect(
        vault.connect(wantHolder)['withdraw(uint256,address,address)'](mintAmount, owner.address, wantHolderAddr),
      )
        .to.emit(vault, 'Withdraw')
        .withArgs(wantHolderAddr, owner.address, wantHolderAddr, mintAmount, mintAmount);
      const userSharesAfter = await vault.balanceOf(wantHolderAddr);
      const userSharesBurned = userSharesBefore.sub(userSharesAfter);
      expect(userSharesBurned).to.equal(mintAmount);

      // then try minting to other and withdrawing to other without allowance (should revert)
      await vault.connect(wantHolder).mint(mintAmount, owner.address);

      await expect(
        vault.connect(wantHolder)['withdraw(uint256,address,address)'](mintAmount, owner.address, owner.address),
      ).to.be.reverted;

      // have owner give allowance and then try withdrawing to owner, shouldn't revert
      await vault.connect(owner).approve(wantHolderAddr, mintAmount);
      await expect(
        vault.connect(wantHolder)['withdraw(uint256,address,address)'](mintAmount, owner.address, owner.address),
      )
        .to.emit(vault, 'Withdraw')
        .withArgs(wantHolderAddr, owner.address, owner.address, mintAmount, mintAmount);
    });

    it('maxRedeem returns the max number of shares that can be redeemed for user', async function () {
      const {vault, want, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      // no deposits initially
      let maxRedeem = await vault.maxRedeem(wantHolderAddr);
      expect(maxRedeem).to.equal(0);

      // deposit some for self
      const depositAmount = toWantUnit('25');
      await vault.connect(wantHolder)['deposit(uint256,address)'](depositAmount, wantHolderAddr);
      maxRedeem = await vault.maxRedeem(wantHolderAddr);
      expect(maxRedeem).to.equal(toWantUnit('25'));

      // send some assets to change share price
      await want.connect(wantHolder).transfer(vault.address, toWantUnit('10'));
      // new assets = 25 + 10 = 35
      // total shares is still 25
      // so new share price is 35 / 25 = 1.4
      // but number of shares doesn't change
      maxRedeem = await vault.maxRedeem(wantHolderAddr);
      expect(maxRedeem).to.equal(toWantUnit('25')); // still 25 shares

      // mint some for owner
      const mintAmount = toWantUnit('5');
      await vault.connect(wantHolder).mint(mintAmount, owner.address);
      maxRedeem = await vault.maxRedeem(wantHolderAddr);
      expect(maxRedeem).to.equal(toWantUnit('25'));
      maxRedeem = await vault.maxRedeem(owner.address);
      expect(maxRedeem).to.equal(toWantUnit('5'));
    });

    it('previewRedeem returns the amount of assets returned on redeem', async function () {
      const {vault, want, wantHolder} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      let redeemAmount = toWantUnit('50');
      let redeemPreview = await vault.connect(wantHolder).previewRedeem(redeemAmount);
      expect(redeemPreview).to.equal(redeemAmount);

      await vault.connect(wantHolder).mint(redeemAmount, wantHolderAddr);
      redeemPreview = await vault.connect(wantHolder).previewRedeem(redeemAmount);
      expect(redeemPreview).to.equal(redeemAmount); // since share price is 1

      // Change the price per share
      // assets = 50 + 20 = 70
      // shares = 50
      // share price = 70 / 50 = 1.4
      const transferAmount = toWantUnit('20');
      await want.connect(wantHolder).transfer(vault.address, transferAmount);

      redeemAmount = toWantUnit('10');
      redeemPreview = await vault.connect(wantHolder).previewRedeem(redeemAmount);
      expect(redeemPreview).to.equal(toWantUnit('14')); // 10 shares * 1.4 ppfs

      const userBalance = await want.balanceOf(wantHolderAddr);
      await vault.connect(wantHolder).redeem(redeemAmount, wantHolderAddr, wantHolderAddr);
      const userBalanceAfterRedeem = await want.balanceOf(wantHolderAddr);
      expect(userBalanceAfterRedeem).to.equal(userBalance.add(toWantUnit('14')));
    });

    it('4626 redeem to self emits withdraw event', async function () {
      const {vault, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      // first mint to self
      const mintAmount = toWantUnit('10');
      await vault.connect(wantHolder).mint(mintAmount, wantHolderAddr);

      const userSharesBefore = await vault.balanceOf(wantHolderAddr);
      await expect(vault.connect(wantHolder).redeem(mintAmount, wantHolderAddr, wantHolderAddr))
        .to.emit(vault, 'Withdraw')
        .withArgs(wantHolderAddr, wantHolderAddr, wantHolderAddr, mintAmount, mintAmount);
      const userSharesAfter = await vault.balanceOf(wantHolderAddr);
      const userSharesBurned = userSharesBefore.sub(userSharesAfter);
      expect(userSharesBurned).to.equal(mintAmount);

      // then try minting to other and redeeming without allowance (should revert)
      await vault.connect(wantHolder).mint(mintAmount, owner.address);

      await expect(vault.connect(wantHolder).redeem(mintAmount, wantHolderAddr, owner.address)).to.be.reverted;

      // have owner give allowance and then try redeeming, shouldn't revert
      await vault.connect(owner).approve(wantHolderAddr, mintAmount);
      await expect(vault.connect(wantHolder).redeem(mintAmount, wantHolderAddr, owner.address))
        .to.emit(vault, 'Withdraw')
        .withArgs(wantHolderAddr, wantHolderAddr, owner.address, mintAmount, mintAmount);
    });

    it('4626 redeem to other emits withdraw event', async function () {
      const {vault, wantHolder, owner} = await loadFixture(deployVaultAndStrategyAndGetSigners);
      // first mint to self
      const mintAmount = toWantUnit('10');
      await vault.connect(wantHolder).mint(mintAmount, wantHolderAddr);

      const userSharesBefore = await vault.balanceOf(wantHolderAddr);
      await expect(vault.connect(wantHolder).redeem(mintAmount, owner.address, wantHolderAddr))
        .to.emit(vault, 'Withdraw')
        .withArgs(wantHolderAddr, owner.address, wantHolderAddr, mintAmount, mintAmount);
      const userSharesAfter = await vault.balanceOf(wantHolderAddr);
      const userSharesBurned = userSharesBefore.sub(userSharesAfter);
      expect(userSharesBurned).to.equal(mintAmount);

      // then try minting to other and redeeming to other without allowance (should revert)
      await vault.connect(wantHolder).mint(mintAmount, owner.address);

      await expect(vault.connect(wantHolder).redeem(mintAmount, owner.address, owner.address)).to.be.reverted;

      // have owner give allowance and then try redeeming to owner, shouldn't revert
      await vault.connect(owner).approve(wantHolderAddr, mintAmount);
      await expect(vault.connect(wantHolder).redeem(mintAmount, owner.address, owner.address))
        .to.emit(vault, 'Withdraw')
        .withArgs(wantHolderAddr, owner.address, owner.address, mintAmount, mintAmount);
    });
  });
});

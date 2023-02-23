const {ethers, upgrades} = require('hardhat');

async function main() {
  const vaultAddress = 'TODO';

  const Strategy = await ethers.getContractFactory('ReaperStrategyTombMai');
  const treasuryAddress = '0x0e7c5313E9BB80b654734d9b7aB1FB01468deE3b';
  const paymentSplitterAddress = '0x63cbd4134c2253041F370472c130e92daE4Ff174';
  const strategist1 = '0x1E71AEE6081f62053123140aacC7a06021D77348';
  const strategist2 = '0x81876677843D00a7D792E1617459aC2E93202576';
  const strategist3 = '0x1A20D7A31e5B3Bc5f02c8A146EF6f394502a10c4';
  const superAdmin = '0x04C710a1E8a738CDf7cAD3a52Ba77A784C35d8CE';
  const admin = '0x539eF36C804e4D735d8cAb69e8e441c12d4B88E0';
  const guardian = '0xf20E25f2AB644C8ecBFc992a6829478a85A98F2c';
  const keepers = [
    '0x33D6cB7E91C62Dd6980F16D61e0cfae082CaBFCA',
    '0x34Df14D42988e4Dc622e37dc318e70429336B6c5',
    '0x36a63324edFc157bE22CF63A6Bf1C3B49a0E72C0',
    '0x51263D56ec81B5e823e34d7665A1F505C327b014',
    '0x5241F63D0C1f2970c45234a0F5b345036117E3C2',
    '0x5318250BD0b44D1740f47a5b6BE4F7fD5042682D',
    '0x55a078AFC2e20C8c20d1aa4420710d827Ee494d4',
    '0x73C882796Ea481fe0A2B8DE499d95e60ff971663',
    '0x7B540a4D24C906E5fB3d3EcD0Bb7B1aEd3823897',
    '0x8456a746e09A18F9187E5babEe6C60211CA728D1',
    '0x87A5AfC8cdDa71B5054C698366E97DB2F3C2BC2f',
    '0x9a2AdcbFb972e0EC2946A342f46895702930064F',
    '0xd21e0fe4ba0379ec8df6263795c8120414acd0a3',
    '0xe0268Aa6d55FfE1AA7A77587e56784e5b29004A2',
    '0xf58d534290Ce9fc4Ea639B8b9eE238Fe83d2efA6',
    '0xCcb4f4B05739b6C62D9663a5fA7f1E2693048019',
  ];

  const strategy = await upgrades.deployProxy(
    Strategy,
    [
      vaultAddress,
      [treasuryAddress, paymentSplitterAddress],
      [strategist1, strategist2, strategist3],
      [superAdmin, admin, guardian],
      keepers,
    ],
    {kind: 'uups', timeout: 0},
  );

  await strategy.deployed();
  console.log('Strategy deployed to:', strategy.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

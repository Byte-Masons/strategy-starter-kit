// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./interfaces/IStrategy.sol";
import "oz-contracts/access/Ownable.sol";
import "oz-contracts/security/ReentrancyGuard.sol";
import "oz-contracts/token/ERC20/ERC20.sol";
import "oz-contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @dev Implementation of a vault to deposit funds for yield optimizing.
 * This is the contract that receives funds and that users interface with.
 * The yield optimizing strategy itself is implemented in a separate 'Strategy.sol' contract.
 */
contract ReaperVaultv1_5 is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    // The strategy in use by the vault.
    address public strategy;

    uint256 public constant PERCENT_DIVISOR = 10000;
    uint256 public tvlCap;

    /**
     * @dev The stretegy's initialization status. Gives deployer 20 minutes after contract
     * construction (constructionTime) to set the strategy implementation.
     */
    bool public initialized = false;
    uint256 public constructionTime;

    // The token the vault accepts and looks to maximize.
    IERC20Metadata public immutable token;

    /**
     * + WEBSITE DISCLAIMER +
     * While we have taken precautionary measures to protect our users,
     * it is imperative that you read, understand and agree to the disclaimer below:
     *
     * Using our platform may involve financial risk of loss.
     * Never invest more than what you can afford to lose.
     * Never invest in a Reaper Vault with tokens you don't trust.
     * Never invest in a Reaper Vault with tokens whose rules for minting you don’t agree with.
     * Ensure the accuracy of the contracts for the tokens in the Reaper Vault.
     * Ensure the accuracy of the contracts for the Reaper Vault and Strategy you are depositing in.
     * Check our documentation regularly for additional disclaimers and security assessments.
     * ...and of course: DO YOUR OWN RESEARCH!!!
     *
     * By accepting these terms, you agree that Byte Masons, Fantom.Farm, or any parties
     * affiliated with the deployment and management of these vaults or their attached strategies
     * are not liable for any financial losses you might incur as a direct or indirect
     * result of investing in any of the pools on the platform.
     */
    mapping(address => bool) public hasReadAndAcceptedTerms;

    /**
     * @dev simple mappings used to determine PnL denominated in LP tokens,
     * as well as keep a generalized history of a user's protocol usage.
     */
    mapping(address => uint256) public cumulativeDeposits;
    mapping(address => uint256) public cumulativeWithdrawals;

    event TermsAccepted(address user);
    event TvlCapUpdated(uint256 newTvlCap);

    event DepositsIncremented(address user, uint256 amount, uint256 total);
    event WithdrawalsIncremented(address user, uint256 amount, uint256 total);

    /**
     * @dev Initializes the vault's own 'RF' token.
     * This token is minted when someone does a deposit. It is burned in order
     * to withdraw the corresponding portion of the underlying assets.
     * @param _token the token to maximize.
     * @param _name the name of the vault token.
     * @param _symbol the symbol of the vault token.
     * @param _tvlCap initial deposit cap for scaling TVL safely
     */
    constructor(
        address _token,
        string memory _name,
        string memory _symbol,
        uint256 _tvlCap
    ) ERC20(string(_name), string(_symbol)) {
        token = IERC20Metadata(_token);
        constructionTime = block.timestamp;
        tvlCap = _tvlCap;
    }

    /**
     * @dev Overrides the default 18 decimals for the vault ERC20 to
     * match the same decimals as the underlying token used
     */
    function decimals() public view override returns (uint8) {
        return token.decimals();
    }

    /**
     * @dev Connects the vault to its initial strategy. One use only.
     * @notice deployer has only 20 minutes after construction to connect the initial strategy.
     * @param _strategy the vault's initial strategy
     */

    function initialize(address _strategy) public onlyOwner returns (bool) {
        require(!initialized, "Contract is already initialized.");
        require(block.timestamp <= (constructionTime + 1200), "initialization period over, too bad!");
        strategy = _strategy;
        initialized = true;
        return true;
    }

    /**
     * @dev Gives user access to the client
     * @notice this does not affect vault permissions, and is read from client-side
     */
    function agreeToTerms() public returns (bool) {
        require(!hasReadAndAcceptedTerms[msg.sender], "you have already accepted the terms");
        hasReadAndAcceptedTerms[msg.sender] = true;
        emit TermsAccepted(msg.sender);
        return true;
    }

    /**
     * @dev It calculates the total underlying value of {token} held by the system.
     * It takes into account the vault contract balance, the strategy contract balance
     * and the balance deployed in other contracts as part of the strategy.
     */
    function balance() public view returns (uint256) {
        return token.balanceOf(address(this)) + IStrategy(strategy).balanceOf();
    }

    /**
     * @dev Custom logic in here for how much the vault allows to be borrowed.
     * We return 100% of tokens for now. Under certain conditions we might
     * want to keep some of the system funds at hand in the vault, instead
     * of putting them to work.
     */
    function available() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
     * @dev Function for various UIs to display the current value of one of our yield tokens.
     * Returns an uint256 with 18 decimals of how much underlying asset one vault share represents.
     */
    function getPricePerFullShare() public view returns (uint256) {
        uint256 _decimals = decimals();
        return totalSupply() == 0 ? 10**_decimals : (balance() * 10**_decimals) / totalSupply();
    }

    /**
     * @dev A helper function to call deposit() with all the sender's funds.
     */
    function depositAll() external {
        deposit(token.balanceOf(msg.sender));
    }

    /**
     * @dev The entrypoint of funds into the system. People deposit with this function
     * into the vault. The vault is then in charge of sending funds into the strategy.
     */
    function deposit(uint256 _amount) public nonReentrant {
        require(_amount != 0, "please provide amount");
        uint256 _pool = balance();
        require(_pool + _amount <= tvlCap, "vault is full!");

        token.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 shares = 0;
        if (totalSupply() == 0) {
            shares = _amount;
        } else {
            shares = (_amount * totalSupply()) / _pool;
        }
        _mint(msg.sender, shares);
        earn();
        incrementDeposits(_amount);
    }

    /**
     * @dev Function to send funds into the strategy and put them to work. It's primarily called
     * by the vault's deposit() function.
     */
    function earn() public {
        uint256 _bal = available();
        token.safeTransfer(strategy, _bal);
        IStrategy(strategy).deposit();
    }

    /**
     * @dev A helper function to call withdraw() with all the sender's funds.
     */
    function withdrawAll() external {
        withdraw(balanceOf(msg.sender));
    }

    /**
     * @dev Function to exit the system. The vault will withdraw the required tokens
     * from the strategy and pay up the token holder. A proportional number of IOU
     * tokens are burned in the process.
     */
    function withdraw(uint256 _shares) public nonReentrant {
        require(_shares > 0, "please provide amount");
        uint256 r = (balance() * _shares) / totalSupply();
        _burn(msg.sender, _shares);

        uint256 b = token.balanceOf(address(this));
        if (b < r) {
            uint256 _withdraw = r - b;
            IStrategy(strategy).withdraw(_withdraw);
            uint256 _after = token.balanceOf(address(this));
            uint256 _diff = _after - b;
            if (_diff < _withdraw) {
                r = b + _diff;
            }
        }
        token.safeTransfer(msg.sender, r);
        incrementWithdrawals(r);
    }

    /**
     * @dev pass in max value of uint to effectively remove TVL cap
     */
    function updateTvlCap(uint256 _newTvlCap) public onlyOwner {
        tvlCap = _newTvlCap;
        emit TvlCapUpdated(tvlCap);
    }

    /**
     * @dev helper function to remove TVL cap
     */
    function removeTvlCap() external onlyOwner {
        updateTvlCap(type(uint256).max);
    }

    /*
     * @dev functions to increase user's cumulative deposits and withdrawals
     * @param _amount number of LP tokens being deposited/withdrawn
     */

    function incrementDeposits(uint256 _amount) internal returns (bool) {
        uint256 initial = cumulativeDeposits[tx.origin];
        uint256 newTotal = initial + _amount;
        cumulativeDeposits[tx.origin] = newTotal;
        emit DepositsIncremented(tx.origin, _amount, newTotal);
        return true;
    }

    function incrementWithdrawals(uint256 _amount) internal returns (bool) {
        uint256 initial = cumulativeWithdrawals[tx.origin];
        uint256 newTotal = initial + _amount;
        cumulativeWithdrawals[tx.origin] = newTotal;
        emit WithdrawalsIncremented(tx.origin, _amount, newTotal);
        return true;
    }

    /**
     * @dev Rescues random funds stuck that the strat can't handle.
     * @param _token address of the token to rescue.
     */
    function inCaseTokensGetStuck(address _token) external onlyOwner {
        require(_token != address(token), "!token");

        uint256 amount = IERC20Metadata(_token).balanceOf(address(this));
        IERC20Metadata(_token).safeTransfer(msg.sender, amount);
    }
}
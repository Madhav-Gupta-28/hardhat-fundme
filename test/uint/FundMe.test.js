const { deployments, getNamedAccounts, ethers } = require("hardhat");
const { expect, assert } = require("chai");
const {
  isCallTrace,
} = require("hardhat/internal/hardhat-network/stack-traces/message-trace");

describe("fundme", async function() {
  let fundMe, deployer, mockV3Aggregator;
  let sendvalue = ethers.utils.parseEther("1");

  beforeEach(async function() {
    deployer = (await getNamedAccounts()).deployer;
    await deployments.fixture(["all"]);
    fundMe = await ethers.getContract(["FundMe"], deployer);
    mockV3Aggregator = await ethers.getContract("MockV3Aggregator", deployer);
  });

  describe("constructor", async function() {
    it("sets the aggregator address correctly", async function() {
      const response = await fundMe.getPriceFeed();
      assert.equal(response, mockV3Aggregator.address);
    });
  });

  describe("fund", async function() {
    it("if it revert the contract if not enough eth is sent", async function() {
      await expect(fundMe.fund()).to.be.revertedWith(
        "You need to spend more eth"
      );
    });

    it("update the amoutn funded to the data structure", async function() {
      await fundMe.fund({ value: sendvalue });
      const response = await fundMe.getAddressToAmountFunded(deployer);
      assert.equal(response.toString(), sendvalue.toString());
    });

    it("pushing donates addressed to funders array", async function() {
      await fundMe.fund({ value: sendvalue });
      const funder = await fundMe.getFunder(0);
      assert.equal(funder, deployer);
    });
  });

  describe("withdraw", async function() {
    beforeEach(async function() {
      await fundMe.fund({ value: sendvalue });
    });

    it("withdraw eth from a single funder", async function() {
      const startingFundmeBalance = await fundMe.provider.getBalance(
        fundMe.address
      );
      const startingDeployerBalance = await fundMe.provider.getBalance(
        deployer
      );

      const transactionResponse = await fundMe.withdraw();
      const transactionReceipt = await transactionResponse.wait(1);

      const { gasUsed, effectiveGasPrice } = transactionReceipt;
      const gasCost = gasUsed.mul(effectiveGasPrice);

      const endingFundMeBalance = await fundMe.provider.getBalance(
        fundMe.address
      );
      const endingDeployerBalance = await fundMe.provider.getBalance(deployer);

      assert.equal(endingFundMeBalance, 0);
      assert.equal(
        startingFundMeBalance.add(startingDeployerBalance).toString(),
        endingDeployerBalance.add(gasCost).toString()
      );
    });

    it("wthdrawing eth from multiples funders", async function() {
      const acc = await ethers.getSigners();

      for (let i = 1; i < 6; i++) {
        const fundmeConnectContract = await fundMe.connect(acc[i]);
        await fundmeConnectContract.fund({ value: sendvalue });
      }

      const startingFundmeBalance = await fundMe.provider.getBalance(
        fundMe.address
      );
      const startingDeployerBalance = await fundMe.provider.getBalance(
        deployer
      );

      const transactionResponse = await fundMe.withdraw();
      const transactionReceipt = await transactionResponse.wait(1);
      const { gasUsed, effectiveGasPrice } = transactionReceipt;
      const gasCost = gasUsed.mul(effectiveGasPrice);
      const endingFundMeBalance = await fundMe.provider.getBalance(
        fundMe.address
      );
      const endingDeployerBalance = await fundMe.provider.getBalance(deployer);

      assert.equal(endingFundMeBalance, 0);
      assert.equal(
        startingFundmeBalance.add(startingDeployerBalance).toString(),
        endingDeployerBalance.add(gasCost).toString()
      );

      await expect(fundMe.getFunder(0)).to.be.reverted;

      for (i = 1; i < 6; i++) {
        assert.equal(await fundMe.getAddressToAmountFunded(acc[i].address), 0);
      }
    });

    it("only owner to withdraw", async function() {
      const accounts = ethers.getSigners();
      const attacker = accounts[1];

      const attackerConnectedContract = await fundMe.connect(attacker);
      await expect(attackerConnectedContract.withdraw()).to.be.reverted;
    });
  });
});

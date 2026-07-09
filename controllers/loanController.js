const Loan = require("../models/Loan");

exports.requestLoan = async (req, res) => {
  try {
    const { memberId, loanAmount, interestRate, endDate } = req.body;

    const loan = new Loan({ memberId, loanAmount, interestRate, endDate });
    await loan.save();

    res.status(201).json({ message: "Loan request submitted successfully!", loan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getLoans = async (req, res) => {
  try {
    const loans = await Loan.find().populate("memberId", "firstName lastName email");
    res.status(200).json(loans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateLoanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const loan = await Loan.findByIdAndUpdate(id, { status }, { new: true });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found!" });
    }

    res.status(200).json({ message: "Loan status updated successfully!", loan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

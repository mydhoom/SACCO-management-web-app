const Member = require("../models/Member");

exports.addMember = async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;

    const existingMember = await Member.findOne({ email });
    if (existingMember) {
      return res.status(400).json({ error: "Member with this email already exists." });
    }

    const member = new Member({ firstName, lastName, email, phone });
    await member.save();

    res.status(201).json({ message: "Member added successfully!", member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMembers = async (req, res) => {
  try {
    const members = await Member.find();
    res.status(200).json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMember = async (req, res) => {
  try {
    const { id } = req.params;

    const member = await Member.findById(id);
    if (!member) {
      return res.status(404).json({ error: "Member not found!" });
    }

    res.status(200).json(member);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, active } = req.body;

    const member = await Member.findByIdAndUpdate(
      id,
      { firstName, lastName, phone, active },
      { new: true }
    );

    if (!member) {
      return res.status(404).json({ error: "Member not found!" });
    }

    res.status(200).json({ message: "Member updated successfully!", member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteMember = async (req, res) => {
  try {
    const { id } = req.params;

    const member = await Member.findByIdAndDelete(id);
    if (!member) {
      return res.status(404).json({ error: "Member not found!" });
    }

    res.status(200).json({ message: "Member deleted successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

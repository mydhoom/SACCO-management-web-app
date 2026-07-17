// Updated to use User model
const User = require("../models/User"); 

exports.addMember = async (req, res) => {
  try {
    // These fields must match exactly what your frontend is sending
    const { name, vendorNo, designation, phoneNumber, password, status } = req.body;

    // Check if user already exists (you might want to check by vendorNo instead of email)
    const existingUser = await User.findOne({ vendorNo });
    if (existingUser) {
      return res.status(400).json({ error: "Member with this Vendor No. already exists." });
    }

    // Create the new user
    const newUser = new User({ 
      name, 
      vendorNo, 
      designation, 
      phoneNumber, 
      password,
      status: status || 'approved' 
    });
    
    await newUser.save();

    res.status(201).json({ message: "Member added successfully!", member: newUser });
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

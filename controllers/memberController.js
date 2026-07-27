const User = require("../models/User"); 

// --- HELPER FUNCTION: Auto-Calculate Retirement Date ---
// Calculates the last day of the birth month, 58 years later.
const calculateRetirementDate = (dobInput) => {
  const dob = new Date(dobInput);
  // In JS, passing '0' as the day gives the last day of the previous month.
  // So, dob.getMonth() + 1 with day 0 gives the last day of the current birth month.
  return new Date(dob.getFullYear() + 58, dob.getMonth() + 1, 0);
};

exports.addMember = async (req, res) => {
  try {
    const { name, vendorNo, designation, phoneNumber, password, status, dateOfBirth, dateOfRetirement } = req.body;

    const existingUser = await User.findOne({ vendorNo });
    if (existingUser) {
      return res.status(400).json({ error: "Member with this Vendor No. already exists." });
    }

    // Auto-calculate DOR if DOB is provided but DOR is left blank
    const finalDor = dateOfRetirement || (dateOfBirth ? calculateRetirementDate(dateOfBirth) : null);

    const newUser = new User({ 
      name, 
      vendorNo, 
      designation, 
      phoneNumber, 
      password,
      status: status || 'approved',
      dateOfBirth,
      dateOfRetirement: finalDor
    });
    
    await newUser.save();

    res.status(201).json({ message: "Member added successfully!", member: newUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMembers = async (req, res) => {
  try {
    const members = await User.find(); 
    res.status(200).json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMember = async (req, res) => {
  try {
    const { id } = req.params;

    const member = await User.findById(id); 
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
    const { firstName, lastName, phone, active, dateOfBirth, dateOfRetirement } = req.body;

    // Fetch existing user to check dates if needed
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({ error: "Member not found!" });
    }

    // Auto-calculate DOR if DOB is updated but no new manual DOR is provided
    let finalDor = dateOfRetirement;
    if (!finalDor && dateOfBirth) {
      finalDor = calculateRetirementDate(dateOfBirth);
    }

    const member = await User.findByIdAndUpdate( 
      id,
      { 
        firstName, 
        lastName, 
        phone, 
        active, 
        dateOfBirth, 
        dateOfRetirement: finalDor 
      },
      { new: true }
    );

    res.status(200).json({ message: "Member updated successfully!", member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteMember = async (req, res) => {
  try {
    const { id } = req.params;

    const member = await User.findByIdAndDelete(id); 
    if (!member) {
      return res.status(404).json({ error: "Member not found!" });
    }

    res.status(200).json({ message: "Member deleted successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
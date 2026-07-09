const User = require("../models/User");
const { generateToken } = require("../utils/jwtUtils");

exports.register = async (req, res) => {
  try {
    const { name, vendorNo, password } = req.body;

    // SECURITY: We ignore any "role" or "status" the user tries to send. 
    // They are forced to be a standard member and locked as "pending".
    const user = new User({ 
      name, 
      vendorNo, 
      password, 
      role: "member", 
      status: "pending" 
    });
    
    await user.save();

    res.status(201).json({ message: "Registration successful! Please wait for Admin approval." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { vendorNo, password } = req.body;

    const user = await User.findOne({ vendorNo });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials!" });
    }

    // SECURITY: The Approval Check
    if (user.status !== "approved") {
      return res.status(403).json({ error: "Your account is pending admin approval." });
    }

    const token = generateToken({ id: user._id, role: user.role });
    
    res.status(200).json({ token, user: { name: user.name, vendorNo: user.vendorNo, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.bulkUpload = async (req, res) => {
  try {
    const membersData = req.body; 
    let addedCount = 0;
    let updatedCount = 0;

    for (let data of membersData) {
      // SECURITY: Force all Excel uploads to be approved members
      data.role = "member";
      data.status = "approved"; // Automatically unlock Excel users!

      const { password, ...updateData } = data;

      const existingUser = await User.findOne({ vendorNo: data.vendorNo });

      if (existingUser) {
        await User.updateOne({ vendorNo: data.vendorNo }, { $set: updateData });
        updatedCount++;
      } else {
        data.password = "HPSEBL@123"; 
        const newUser = new User(data);
        await newUser.save(); 
        addedCount++;
      }
    }

    res.status(200).json({ 
      message: "Excel upload processed successfully!", 
      added: addedCount, 
      updated: updatedCount 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// --- NEW: FETCH ALL MEMBERS ---
exports.getAllMembers = async (req, res) => {
  try {
    // We fetch everyone, but we use .select("-password") for security so passwords never leave the database
    const users = await User.find({}).select("-password").sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- NEW: DELETE A MEMBER ---
exports.deleteMember = async (req, res) => {
  try {
    const { vendorNo } = req.params;
    const deletedUser = await User.findOneAndDelete({ vendorNo });
    
    if (!deletedUser) {
      return res.status(404).json({ error: "Member not found" });
    }
    
    res.status(200).json({ message: "Member deleted successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
import bcrypt from "bcrypt";
import { Op } from "sequelize";
import { ZarklyXUser } from "../../../api-webapp/superAdmin/authentication/user/user-model";
import { ZarklyXRole } from "../../../api-webapp/superAdmin/rbac/roles/roles-model";
import { generateZarklyXToken } from "../../../../services/zarklyX-jwt-service";

/**
 * Register a new ZarklyX internal user
 * Only SuperAdmin or PlatformAdmin can create new ZarklyX users
 */
export async function registerZarklyXUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleId: string;
  phoneNumber?: string;
  isdCode?: string;
  isoCode?: string;
  department?: string;
  createdBy: string; // The admin creating this user
}): Promise<{
  success: boolean;
  message: string;
  user?: any;
  token?: string;
}> {
  try {
    // Input validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return {
        success: false,
        message: "Invalid email format",
      };
    }

    if (data.password.length < 8) {
      return {
        success: false,
        message: "Password must be at least 8 characters",
      };
    }

    if (!data.firstName?.trim() || !data.lastName?.trim()) {
      return {
        success: false,
        message: "First name and last name are required",
      };
    }

    // SECURITY: Get creator's role to validate authorization
    const creatorUser = await ZarklyXUser.findByPk(data.createdBy, {
      include: [{ model: ZarklyXRole, as: "role" }],
    });

    if (!creatorUser || !creatorUser.roleId) {
      return {
        success: false,
        message: "Creator user not found or has no role",
      };
    }

    const creatorRole = (creatorUser as any).role;

    if (!creatorRole) {
      return {
        success: false,
        message: "Creator role not found",
      };
    }

    // RULE 1: Only high-priority users can create ZarklyX users (priority <= 20)
    // SuperAdmin=0, PlatformAdmin=10, SupportLead=20 can create; lower roles cannot
    if (creatorRole.priority > 20) {
      return {
        success: false,
        message: "Not authorized to create ZarklyX users. Only Super Admin, Platform Admin, or Support Lead can create users.",
      };
    }

    // Check if email already exists
    const existingUser = await ZarklyXUser.findOne({
      where: { email: data.email },
    });

    if (existingUser) {
      return {
        success: false,
        message: "Email already exists in ZarklyX system",
      };
    }

    // Verify target role exists
    const targetRole = await ZarklyXRole.findByPk(data.roleId);
    if (!targetRole) {
      return {
        success: false,
        message: "Invalid role ID",
      };
    }

    // RULE 2: Cannot create users with higher authority (lower priority)
    if (targetRole.priority < creatorRole.priority) {
      return {
        success: false,
        message: `Cannot create user with higher authority. Target role priority (${targetRole.priority}) is higher than your role priority (${creatorRole.priority}).`,
      };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const newUser = await ZarklyXUser.create({
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      roleId: data.roleId,
      phoneNumber: data.phoneNumber || "",
      isdCode: data.isdCode || "",
      isoCode: data.isoCode || "",
      department: data.department || null,
      isActive: true,
      isDeleted: false,
      isThemeDark: false,
      authProvider: "email",
      isEmailVerified: false,
      twofactorEnabled: false,
      twofactorVerified: false,
    });

    // Generate token
    const token = await generateZarklyXToken({
      id: newUser.id,
      email: newUser.email,
      roleId: newUser.roleId,
      department: newUser.department || undefined,
    });

    return {
      success: true,
      message: "ZarklyX user registered successfully",
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        roleId: newUser.roleId,
        department: newUser.department,
      },
      token,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to register ZarklyX user",
    };
  }
}

/**
 * Login ZarklyX internal user
 */
export async function loginZarklyXUser(
  email: string,
  password: string
): Promise<{
  success: boolean;
  message: string;
  user?: any;
  token?: string;
  requires2FA?: boolean;
}> {
  try {
    // Find user by email
    const user = await ZarklyXUser.findOne({
      where: { email },
      include: [
        {
          model: ZarklyXRole,
          as: "role",
        },
      ],
    });

    if (!user) {
      return {
        success: false,
        message: "Invalid credentials",
      };
    }

    // Check if account is active
    if (!user.isActive) {
      return {
        success: false,
        message: "Account is inactive. Contact administrator.",
      };
    }

    if (user.isDeleted) {
      return {
        success: false,
        message: "Account has been deleted",
      };
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return {
        success: false,
        message: "Invalid credentials",
      };
    }

    // Check if 2FA is enabled
    if (user.twofactorEnabled && user.twofactorVerified) {
      return {
        success: true,
        message: "Password verified. Please provide 2FA code.",
        requires2FA: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      };
    }

    // Update last login
    await user.update({ lastLoginAt: new Date() });

    // Generate token
    const token = await generateZarklyXToken({
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      department: user.department || undefined,
    });

    return {
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        department: user.department,
        role: (user as any).role,
        lastLoginAt: user.lastLoginAt,
      },
      token,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Login failed",
    };
  }
}

/**
 * Change password for ZarklyX user
 */
export async function changeZarklyXPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const user = await ZarklyXUser.findByPk(userId);

    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return {
        success: false,
        message: "Current password is incorrect",
      };
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await user.update({ password: hashedPassword });

    return {
      success: true,
      message: "Password changed successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to change password",
    };
  }
}

/**
 * Reset password for a ZarklyX user (Admin function)
 * Allows admins to reset another user's password without knowing current password
 */
export async function resetZarklyXPassword(
  userId: string,
  newPassword: string,
  resetBy: string
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const user = await ZarklyXUser.findByPk(userId);

    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    if (!user.isActive || user.isDeleted) {
      return {
        success: false,
        message: "Cannot reset password for inactive or deleted user",
      };
    }

    // Validate new password
    if (newPassword.length < 8) {
      return {
        success: false,
        message: "Password must be at least 8 characters",
      };
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await user.update({ password: hashedPassword });

    console.log(`✅ Password reset for user ${userId} by ${resetBy}`);

    return {
      success: true,
      message: "Password reset successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to reset password",
    };
  }
}

/**
 * Complete login after 2FA verification
 */
export async function completeLoginAfter2FA(
  userId: string
): Promise<{
  success: boolean;
  message: string;
  user?: any;
  token?: string;
}> {
  try {
    const user = await ZarklyXUser.findOne({
      where: { id: userId },
      include: [
        {
          model: ZarklyXRole,
          as: "role",
        },
      ],
    });

    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    // Update last login
    await user.update({ lastLoginAt: new Date() });

    // Generate token
    const token = await generateZarklyXToken({
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      department: user.department || undefined,
    });

    return {
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        department: user.department,
        role: (user as any).role,
        lastLoginAt: user.lastLoginAt,
      },
      token,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to complete login",
    };
  }
}
import { Op, Transaction } from "sequelize";
import { Clients } from "../clients/clients-model";
import { User } from "../../authentication/user/user-model";
import { ClientUserAssignment } from "../../agency/client-assignment/client-assignment-model";
import { Role } from "../../roles/role-model";
import {Employee } from "../employee/employee-model";
import db from "../../../../db/core/control-db";

// Priority thresholds for role classification
// Lower priority = higher authority (SuperAdmin=0, CompanyAdmin=10, Manager=20, Employee=30+)
const MANAGER_PRIORITY_THRESHOLD = 30;  // Manager: priority < 30
const EMPLOYEE_PRIORITY_THRESHOLD = 30; // Employee: priority >= 30

/**
 * Checks if a role is a manager role based on priority
 * Manager roles have priority < 30
 */
export const isManagerRole = async (roleId: string): Promise<boolean> => {
  if (!roleId) return false;
  
  const role = await Role.findByPk(roleId);
  if (!role) return false;
  
  return role.priority < MANAGER_PRIORITY_THRESHOLD;
};

/**
 * Checks if a role is an employee role based on priority
 * Employee roles have priority >= 30
 */
export const isEmployeeRole = async (roleId: string): Promise<boolean> => {
  if (!roleId) return false;
  
  const role = await Role.findByPk(roleId);
  if (!role) return false;
  
  return role.priority >= EMPLOYEE_PRIORITY_THRESHOLD;
};

const roleInheritanceCache = new Map<string, boolean>();

const cachedIsManagerRole = async (roleId: string) => {
  const key = `manager:${roleId}`;
  if (roleInheritanceCache.has(key)) {
    return roleInheritanceCache.get(key)!;
  }
  const result = await isManagerRole(roleId);
  roleInheritanceCache.set(key, result);
  return result;
};

const cachedIsEmployeeRole = async (roleId: string) => {
  const key = `employee:${roleId}`;
  if (roleInheritanceCache.has(key)) {
    return roleInheritanceCache.get(key)!;
  }
  const result = await isEmployeeRole(roleId);
  roleInheritanceCache.set(key, result);
  return result;
};



export const assignUsersToClient = async (
  clientId: string,
  managerIds: string[],
  employeeIds: string[],
  assignedBy: string
) => {
  // Validate input
  if (!managerIds || !Array.isArray(managerIds)) {
    throw new Error("managerIds must be an array");
  }
  if (!employeeIds || !Array.isArray(employeeIds)) {
    throw new Error("employeeIds must be an array");
  }
  if (managerIds.length === 0 && employeeIds.length === 0) {
    throw new Error("At least one manager or employee must be assigned");
  }

  const client = await Clients.findByPk(clientId);
  if (!client) throw new Error("Client not found");

  const users = await User.findAll({
    where: { id: [...managerIds, ...employeeIds] },
    include: [{ model: Role, as: "role" }],
  });

  // Validate that all provided user IDs exist
  const foundUserIds = users.map(u => u.id);
  const allRequestedIds = [...managerIds, ...employeeIds];
  const missingIds = allRequestedIds.filter(id => !foundUserIds.includes(id));
  if (missingIds.length > 0) {
    throw new Error(`Users not found: ${missingIds.join(", ")}`);
  }

  // Validate role assignments
  // - Managers: Must have manager role (priority < 30)
  // - Employees: Can be either employees (priority >= 30) OR managers (allows managers to work as employees)
  for (const user of users) {
    if (managerIds.includes(user.id)) {
      const isManager = await cachedIsManagerRole(user.roleId!);
      if (!isManager) {
        throw new Error(`User ${user.id} does not have a manager role`);
      }
    }

    if (employeeIds.includes(user.id)) {
      const isEmployee = await cachedIsEmployeeRole(user.roleId!) || await cachedIsManagerRole(user.roleId!);
      if (!isEmployee) {
        throw new Error(`User ${user.id} does not have an employee/manager role`);
      }
    }
  }

  // Deactivate old assignments
  await ClientUserAssignment.update(
    { isActive: false },
    { where: { clientId } }
  );

  const rows: {
    companyId: string;
    clientId: string;
    assignedUserId: string;
    role: "manager" | "employee";
    assignedBy: string;
    isActive: boolean;
  }[] = [
    ...managerIds.map((id) => ({
      companyId: client.companyId!,
      clientId,
      assignedUserId: id,
      role: "manager" as const,
      assignedBy,
      isActive: true,
    })),
    ...employeeIds.map((id) => ({
      companyId: client.companyId!,
      clientId,
      assignedUserId: id,
      role: "employee" as const,
      assignedBy,
      isActive: true,
    })),
  ];

  await ClientUserAssignment.bulkCreate(rows);

  await client.update({ isassigned: true });
};


export const getAvailableManagers = async (clientId: string) => {
  const client = await Clients.findByPk(clientId);
  if (!client) throw new Error("Client not found");

  const users = await User.findAll({
    where: {
      companyId: client.companyId,
      isActive: true,
      isDeleted: false,
    },
    include: [{ model: Role, as: "role" }],
  });

  const result = [];
  for (const user of users) {
    if (user.roleId && await cachedIsManagerRole(user.roleId)) {
      result.push(user);
    }
  }

  return result;
};


export const getAvailableEmployees = async (clientId: string) => {
  const client = await Clients.findByPk(clientId);
  if (!client) throw new Error("Client not found");

  const users = await User.findAll({
    where: {
      companyId: client.companyId,
      isActive: true,
      isDeleted: false,
    },
    include: [{ model: Role, as: "role" }],
  });

  const result = [];
  for (const user of users) {
    if (user.roleId && await cachedIsEmployeeRole(user.roleId)) {
      result.push(user);
    }
  }

  return result;
};

/**
 * Partially update client assignments (add/remove specific users)
 */
export const partiallyUpdateClientAssignments = async (
  clientId: string,
  payload: {
    add?: { managers?: string[]; employees?: string[] };
    remove?: { managers?: string[]; employees?: string[] };
  },
  assignedBy: string
) => {
  const t = await db.transaction();

  try {
    const client = await Clients.findByPk(clientId, { transaction: t });
    if (!client) throw new Error("Client not found");

    const addManagers = payload.add?.managers || [];
    const addEmployees = payload.add?.employees || [];
    const removeManagers = payload.remove?.managers || [];
    const removeEmployees = payload.remove?.employees || [];

    const allUserIds = [
      ...addManagers,
      ...addEmployees,
      ...removeManagers,
      ...removeEmployees,
    ];

    if (allUserIds.length === 0) {
      throw new Error("No assignment changes provided");
    }

    // Remove duplicates
    const uniqueUserIds = [...new Set(allUserIds)];

    // Fetch users once
    const users = await User.findAll({
      where: {
        id: uniqueUserIds,
        companyId: client.companyId,
        isActive: true,
        isDeleted: false,
      },
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });

    // Validate all users exist
    const foundUserIds = users.map(u => u.id);
    const missingIds = uniqueUserIds.filter(id => !foundUserIds.includes(id));
    if (missingIds.length > 0) {
      throw new Error(`Users not found or invalid: ${missingIds.join(", ")}`);
    }

    // Role validation using priority logic
    for (const user of users) {
      if (
        addManagers.includes(user.id) &&
        !(await isManagerRole(user.roleId!))
      ) {
        throw new Error(`User ${user.id} is not manager eligible`);
      }

      if (
        addEmployees.includes(user.id) &&
        !(await isEmployeeRole(user.roleId!) || await isManagerRole(user.roleId!))
      ) {
        throw new Error(`User ${user.id} is not employee eligible`);
      }
    }

    // Ensure business rule: at least one manager must remain assigned after changes
    // Fetch current active manager ids
    const currentActiveManagerAssignments = await ClientUserAssignment.findAll({
      where: { clientId, role: 'manager', isActive: true },
      attributes: ['assignedUserId'],
      transaction: t,
    });
    const managerIdSet = new Set<string>(currentActiveManagerAssignments.map(a => (a as any).assignedUserId));

    // Apply removals
    for (const rm of removeManagers) {
      managerIdSet.delete(rm);
    }

    // Apply additions
    for (const am of addManagers) {
      managerIdSet.add(am);
    }

    if (managerIdSet.size < 1) {
      throw new Error('At least one manager must be assigned to the client');
    }

    // deactivate specified assignments
    const removeUserIds = [...removeManagers, ...removeEmployees];
    if (removeUserIds.length > 0) {
      await ClientUserAssignment.update(
        { isActive: false },
        {
          where: {
            clientId,
            assignedUserId: removeUserIds,
            isActive: true,
          },
          transaction: t,
        }
      );
    }

    // add or reactivate assignments
    const rows = [
      ...addManagers.map((id) => ({
        companyId: client.companyId!,
        clientId,
        assignedUserId: id,
        role: "manager" as const,
        assignedBy,
        isActive: true,
      })),
      ...addEmployees.map((id) => ({
        companyId: client.companyId!,
        clientId,
        assignedUserId: id,
        role: "employee" as const,
        assignedBy,
        isActive: true,
      })),
    ];

    // Use upsert to handle existing assignments (makes it idempotent)
    for (const row of rows) {
      // Check if assignment exists
      const existing = await ClientUserAssignment.findOne({
        where: {
          clientId: row.clientId,
          assignedUserId: row.assignedUserId,
        },
        transaction: t,
      });

      if (existing) {
        // Update existing assignment
        await existing.update(
          { 
            role: row.role, 
            isActive: true,
            assignedBy: row.assignedBy 
          },
          { transaction: t }
        );
      } else {
        // Create new assignment
        await ClientUserAssignment.create(row, { transaction: t });
      }
    }

    // Check if client has any active assignments
    const activeCount = await ClientUserAssignment.count({
      where: {
        clientId,
        isActive: true,
      },
      transaction: t,
    });

    await client.update(
      { isassigned: activeCount > 0 },
      { transaction: t }
    );

    await t.commit();
  } catch (err) {
    if (t && !(t as any).finished) {
      await t.rollback();
    }
    throw err;
  }
};

// Add this to client-assignment-handler.ts
export const getAssignedUsersForClient = async (clientId: string, transaction?: Transaction) => {
  const assignments = await ClientUserAssignment.findAll({
    where: {
      clientId,
      isActive: true,
    },
    include: [
      {
        model: User,
        as: "assignedUser",
        attributes: ["id", "firstName", "lastName", "email"],
        include: [
          {
            model: Role,
            as: "role",
            attributes: ["name", "priority"],
          },
          {
            model:Employee,
            as: "employees",
            attributes:["id","userId"],required:false,
          }
        ]
      }
    ],
    transaction,
  });

  return {
    managers: assignments
      .filter((a) => (a as any).role === "manager")
      .map((a) => {
        const user = (a as any).assignedUser;
        return {
          assignmentId: (a as any).id,
          role: (a as any).role,
          assignedUser: user,
          employeeId: user?.employee?.id ?? user?.employees?.[0]?.id ?? null,
        };
      }),
    employees: assignments
      .filter((a) => (a as any).role === "employee")
      .map((a) => {
        const user = (a as any).assignedUser;
        return {
          assignmentId: (a as any).id,
          role: (a as any).role,
          assignedUser: user,
          employeeId: user?.employee?.id ?? user?.employees?.[0]?.id ?? null,
        };
      }),
  };
};

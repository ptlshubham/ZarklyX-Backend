import { Sequelize } from "sequelize";
import { Role } from "../../routes/api-webapp/roles/role-model";

// Platform-level system roles
const platformRoles = [
  {
    name: "SuperAdmin",
    description: "Full access to all modules and settings",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 0,
    isSystemRole: true,
    priority: 0,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "SubAdmin",
    description: "after admin",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 0,
    isSystemRole: true,
    priority: 10,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Top Level Manager",
    description: "Manage teams and projects",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 0,
    isSystemRole: true,
    priority: 20,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Mid Level Manager",
    description: "Senior Manager teams and projects",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 1,
    isSystemRole: true,
    priority: 22,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Manager",
    description: "middle Manager teams and projects",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 2,
    isSystemRole: true,
    priority: 24,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "First line Manager",
    description: "first line Manager",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 3,
    isSystemRole: true,
    priority: 26,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Team Leader",
    description: "team lead",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 4,
    isSystemRole: true,
    priority: 28,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Senior Employee",
    description: "Work on assigned tasks",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 0,
    isSystemRole: true,
    priority: 30,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Mid",
    description: "Senior employee",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 1,
    isSystemRole: true,
    priority: 35,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Employee",
    description: "mid level employee",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 2,
    isSystemRole: true,
    priority: 40,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Junior",
    description: "junior employee",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 3,
    isSystemRole: true,
    priority: 45,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Intern",
    description: "intern employee",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 4,
    isSystemRole: true,
    priority: 50,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Client",
    description: "View and approve freelance work",
    scope: "platform",
    companyId: null,
    baseRoleId: null,
    level: 0,
    isSystemRole: true,
    priority: 80,
    isActive: true,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

export const seedRoles = async (sequelize: Sequelize) => {
  const qi = sequelize.getQueryInterface();

  try {
    const tables = await qi.showAllTables();
    if (!tables.includes("role")) {
      return;
    }

    const [existingRoles]: any = await sequelize.query(
      `SELECT name FROM role WHERE name IN (${platformRoles.map(r => `'${r.name}'`).join(",")})`
    );
    
    const existingRoleNames = new Set(existingRoles.map((r: any) => r.name));
    const rolesToInsert = platformRoles.filter(r => !existingRoleNames.has(r.name));

    if (rolesToInsert.length > 0) {
      for (const roleData of rolesToInsert) {
        await Role.create(roleData as any);
      }
    }
  } catch (error) {
    console.error("Error seeding roles:", error);
    throw error;
  }
};

import { Sequelize } from "sequelize";

const roles = [
  { name: "agency", displayName: "Agency", description: "Agency role", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { name: "freelancer", displayName: "Freelancer", description: "Freelancer role", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { name: "influencer", displayName: "Influencer", description: "Influencer role", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { name: "superadmin", displayName: "Super Admin", description: "Platform super administrator", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { name: "expert", displayName: "Expert", description: "Expert role", isActive: true, createdAt: new Date(), updatedAt: new Date() },
];

const subRoles = [
  // agency subroles (roleId will be filled after roles are inserted)
  { roleName: "agency", name: "agency_client", displayName: "Agency Client", description: "Client under agency", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { roleName: "agency", name: "agency_employee", displayName: "Agency Employee", description: "Employee under agency", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  // superadmin subroles
  { roleName: "superadmin", name: "sub_admin", displayName: "Sub Admin", description: "Sub admin for platform", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { roleName: "superadmin", name: "zarkly_employee", displayName: "Zarkly Employee", description: "Internal employee", isActive: true, createdAt: new Date(), updatedAt: new Date() },
];

export const seedRoles = async (sequelize: Sequelize) => {
  const qi = sequelize.getQueryInterface();

  // Insert roles
  await qi.bulkInsert("roles", roles, {});

  // Fetch inserted role ids
  const [rows]: any = await sequelize.query(
    `SELECT id, name FROM roles WHERE name IN (${roles.map(r => `'${r.name}'`).join(",")})`
  );

  const roleIdMap: Record<string, number> = {};
  for (const r of rows) {
    roleIdMap[r.name] = r.id;
  }

  // Prepare subroles with proper roleId
  const toInsert = subRoles.map((s) => ({
    roleId: roleIdMap[s.roleName],
    name: s.name,
    displayName: s.displayName,
    description: s.description,
    isActive: s.isActive,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }));

  // Insert subroles
  await qi.bulkInsert("sub_roles", toInsert, {});
};

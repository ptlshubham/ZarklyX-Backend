import { Sequelize } from "sequelize";

import { seedUser } from "./user-seed";
import { seedRoles } from "./role-seed";
import { seedModulesAndPermissions } from "./menu-seed";

export const runSeeders = async (sequelize: Sequelize) => {
    try {
        console.log("Running seeders...\n");
        
        // await seedRoles(sequelize);
        // await seedUser(sequelize);
        await seedModulesAndPermissions(sequelize);
        
        console.log("\nAll seeders completed successfully!\n");
    } catch (error) {
        console.error("Seeder error:", error);
        throw error;
    }
}
import {Sequelize  } from "sequelize";

import { seedUser } from "./user-seed";
import { seedRoles } from "./role-seed";

export const runSeeders = async (sequelize: Sequelize) => {
    console.log("running seeders")
    await seedRoles(sequelize);
    await seedUser(sequelize);

}
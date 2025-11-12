import {Sequelize  } from "sequelize";

import { seedUser } from "./user-seed";

export const runSeeders = async (sequelize: Sequelize) => {
    console.log("running seeders")
    await seedUser(sequelize);

}
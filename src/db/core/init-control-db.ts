import type { Sequelize } from "sequelize";

// Models for Web -app
import { User } from "../../routes/api-webapp/user/user-model";


export {
  User,
};

export function initControlDB(sequelize: Sequelize) {
  // For web App
  User.initModel(sequelize);


  return {
    User,
  };
}

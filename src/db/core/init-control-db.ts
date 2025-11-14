import type { Sequelize } from "sequelize";

// Models for Web -app
import { User } from "../../routes/api-webapp/user/user-model";


export {
  // For Mobile App
  User,
};

export function initControlDB(sequelize: Sequelize) {
  // For Mobile App
  User.initModel(sequelize);


  return {
    User,
  };
}

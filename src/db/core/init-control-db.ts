import type { Sequelize } from "sequelize";

// Models for Mobile - App
import { User } from "../../routes/api-app/user/user-model";
import { AppVersion } from "../../routes/api-app/app-version/app-version-model";
import { Settings } from "../../routes/api-app/settings/settings-model";
import {  Notification} from "../../routes/api-app/notification/notification-model";
// Models for Web -app
import { Employee } from "../../routes/api-webapp/employee/employee-model";
import { Zones } from "../../routes/api-webapp/zones/zones-model";


export {
  // For Mobile App
  User,
  AppVersion,
  Settings,
  Notification,
  Employee,
  Zones,
};

export function initControlDB(sequelize: Sequelize) {
  // For Mobile App
  User.initModel(sequelize);
  AppVersion.initModel(sequelize);
  Settings.initModel(sequelize);
  Notification.initModel(sequelize);
  Employee.initModel(sequelize);
  Zones.initModel(sequelize);


  return {
    User,
    AppVersion,
    Settings,
    Notification,
    Employee,
    Zones,
  };
}

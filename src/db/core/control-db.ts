import { Options, Sequelize } from "sequelize";
import configs from "../../config/config";
import environment from "../../../environment";
// import { runSeeders } from "../seeder-data/main-seed";
import currentUser from "../../services/current-user";
// import { ActivityLogs } from "../../routes/activitylogs/activitylogs-model";
import { ConsoleSpinner } from "../../services/console-info";
import { initControlDB } from "./init-control-db";

// Get the correct configuration based on the current environment (development/production)
const config = (configs as { [key: string]: Options })[environment];

console.log("Database Config:", config);

// Sequelize setup using environment-specific config
const db: Sequelize = new Sequelize({
  dialect: config.dialect, // Ensure dialect (mysql, postgres, etc.)
  database: config.database,
  username: config.username,
  password: config.password,
  host: config.host,
  logging: false, // Optionally disable query logging for production
});

initControlDB(db);
// Authenticate and check DB connection with retry/backoff
const authenticate = async (maxAttempts = 6): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.authenticate();
      ConsoleSpinner.success(`Connected to '${config.database}' DB`);
      return true;
    } catch (err: any) {
      const waitMs = attempt * 1500;
      console.log(`Database Authentication attempt ${attempt}/${maxAttempts} failed: ${err?.message || err}`);
      if (attempt < maxAttempts) {
        console.log(`  Retrying in ${waitMs}ms...`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, waitMs));
        continue;
      }
      console.log("Database Authentication Error:", err);
      return false;
    }
  }
  return false;
};

// Export an initializer so the application controls when to connect
export const initControlDBConnection = async (maxAttempts = 6): Promise<boolean> => {
  const ok = await authenticate(maxAttempts);
  if (ok) {
    await syncControlledDB();
    return true;
  }
  console.warn("Control DB not authenticated; skipping automatic sync.");
  return false;
};

// Sync Database Models and run Seeders
// const syncControlledDB = () => {
//   db.sync({ alter: true })
//     .then(async () => {
//       ConsoleSpinner.start(`Models synced for control DB`);
//     })
//     .catch((err) => {
//       console.error("Error syncing DB:", err); // 
//     });
// };

// syncControlledDB();
const syncControlledDB = async (maxAttempts = 3) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.sync({ alter: true });
      try {
        // await runSeeders(db);
      } catch (error) {
        console.log("Seeding Error:", error);
      }
      ConsoleSpinner.start(`Models synced for control DB`);
      return;
    } catch (err: any) {
      const waitMs = attempt * 2000;
      console.log(`Error syncing DB attempt ${attempt}/${maxAttempts}: ${err?.message || err}`);
      if (attempt < maxAttempts) {
        console.log(`  Retrying in ${waitMs}ms...`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, waitMs));
        continue;
      }
      console.log("Error syncing DB:", err);
    }
  }
};

// (No automatic execution on import - caller should call initControlDBConnection)

export default db;

// Insert data into Activity Logs table (Audit Log)
// export const insertLog = async (instance: any, options: any) => {
//   try {
//     if (instance.constructor.name === "ActivityLogs") return;

//     let changes: { prevObj: any; newObj: any } | undefined = fetchChanges(instance);
//     let oldData = JSON.stringify(instance?._previousDataValues);

//     const { old: oldData1, current: newData } = _getData(changes);
//     const user: any = currentUser.getCurrentUser();
//     let auditLogObj = {
//       userId: user ? user.id : null,
//       oldData,
//       newData,
//       activityType: options?.type ? "UPDATE" : "INSERT", // Determine activity type
//       createdBy: user ? user.id : null,
//       modifiedBy: user ? user.id : null,
//     };

//     await ActivityLogs.create(auditLogObj); // Log activity in DB
//   } catch (error) {
//     console.log("Log Insertion Error:", error);
//   }
// };

// Initialize Sequelize Hooks (before/after operations)
function initHooks() {
  db.addHook("beforeBulkUpdate", (model: any) => {
    model.individualHooks = true;
  });

  db.addHook("beforeCreate", (model: any) => {
    model.individualHooks = true;
  });

  db.addHook("afterSave", (model: any, options: any) => {
    // insertLog(model, options); // Call log insertion after saving model data
  });
}
initHooks();

// Utility Functions for Changes
const js = (d: any) => JSON.stringify(d);

function _getData(model: any): { old: string; current: string } {
  return { old: js(model.prevObj), current: js(model.newObj) };
}

// Fetch previous and current changes from hooks
const fetchChanges = (model: any) => {
  let changes = model?._changed; // Get changed fields

  if (!changes) return;

  let previousValues = model._previousDataValues; // Previous values
  let currentValues = model.dataValues; // Current values

  let prevObj: any = {};
  let newObj: any = {};

  // Generate trial for changed keys
  for (let key of changes.values()) {
    prevObj[key] = previousValues[key];
    newObj[key] = currentValues[key];
  }

  return { prevObj, newObj };
};

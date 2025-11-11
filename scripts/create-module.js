const fs = require("fs");
const path = require("path");

// 1. Get the custom name from the command line arguments
const moduleName = process.argv[2];

if (!moduleName) {
  console.error("❌ Please provide a name for the module.");
  process.exit(1); // Exit with an error code
}

// 2. Define the path for the new module
const modulePath = path.join(__dirname, "..", "src", "modules", moduleName);

// 3. Define the list of files to be created
const filesToCreate = [
  `${moduleName}.model.js`,
  `${moduleName}.service.js`,
  `${moduleName}.validation.js`,
  `${moduleName}.controller.js`,
  `${moduleName}.routes.js`,
];

// 4. Create the directory
try {
  fs.mkdirSync(modulePath, { recursive: true });
  console.log(`✅ Directory created: ${modulePath}`);
} catch (err) {
  console.error(`❌ Error creating directory: ${err.message}`);
  process.exit(1);
}

// 5. Create the files inside the directory
filesToCreate.forEach((fileName) => {
  const filePath = path.join(modulePath, fileName);
  try {
    fs.writeFileSync(filePath, ""); // Creates an empty file
    console.log(`   - File created: ${fileName}`);
  } catch (err) {
    console.error(`❌ Error creating file ${fileName}: ${err.message}`);
  }
});

console.log("\n🎉 Module setup complete!");

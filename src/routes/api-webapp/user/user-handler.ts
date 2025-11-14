import bcrypt from "bcryptjs";
import { User } from "../user/user-model"; // Ensure correct import
import { Op ,Transaction} from "sequelize";
const { MakeQuery } = require("../../../services/model-service");
import axios from "axios";


console.log(User);
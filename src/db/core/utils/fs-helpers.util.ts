import configs from "../../../config/config";
import  environment  from "../../../../environment";
const config = (configs as { [key: string]: any })[environment];


// const currentPath = resolve(__dirname);
// export const ROOT_FOLDER = currentPath.split(config.publicPath)[0] + config.publicPath;
export const ROOT_FOLDER = config.publicPath;


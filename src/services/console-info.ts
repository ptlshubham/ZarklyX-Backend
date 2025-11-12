import colors from "colors/safe";
import ora from "ora";
import environment from "../../environment";
let spinner = ora()
export const ConsoleSpinner = {
    start: (text: string) => {
        spinner.start(text);
    },
    success: (text:string) => {
        spinner.succeed(text)
    },
    error: (text: string) => {
        spinner.fail(text)
    },
    stop: () => {
        spinner.stop()
    },
    // getENV: () => {
    //     if(environment == 'development') {
    //         return colors.green(environment)
    //     }else {
    //         return colors.red(environment)
    //     }
    // }
    getENV: () => {
        if (environment === "development") {  
            return colors.green(environment);
        } else {
            return colors.red(environment);
        }
    }
}
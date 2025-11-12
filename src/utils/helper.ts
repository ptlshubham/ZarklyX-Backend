import configs from "../config/config";
import environment from "../../environment";
const config = (configs as { [key: string]: any })[environment];

export const getAdminLink = (url: string) => {
  return `${config.adminURL}/#/${url}`;
};

export const formatDate = (date: any, format: string = "") => {
  var d = new Date(date),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  if (format == "m-d-y") {
    return [month, year, day].join("-");
  } else if (format == "d-m-y") {
    return [day, month, year].join("-");
  } else if (format == "d-m") {
    return [day, month].join("-");
  } else if (format == "d/m/y") {
    return [day, month, year].join("/");
  } else if (format == "y-d-m") {
    return [year, day, month].join("-");
  } else if (format == "y-m-d") {
    return [year, month, day].join("-");
  } else {
    return [year, month, day].join("-");
  }
};

export const findLastWeekAllDays = () => {
  let lastWeekDates: any = [];

  const today = new Date();

  // Calculate the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = today.getDay();

  // Calculate the last Monday
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) - 7); // Subtract days to get to the last Monday

  // Calculate the last Sunday
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6); // Add 6 days to get to the last Sunday

  // Generate all dates from last Monday to last Sunday
  for (let i = 0; i < 7; i++) {
    const date = new Date(lastMonday);
    date.setDate(lastMonday.getDate() + i);
    //   lastWeekDates.push(date.toDateString());
    lastWeekDates.push(date);
  }

  return lastWeekDates;
};

export const findCurrentWeekAllDays = () => {
  let currentWeekDates: any = [];

  const today = new Date();

  // Calculate the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = today.getDay();

  // Calculate the last Monday
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) - 7); // Subtract days to get to the last Monday

  // Calculate the last Sunday
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6); // Add 6 days to get to the last Sunday

  // Generate all dates from last Monday to last Sunday
  for (let i = 0; i < 7; i++) {
    const date = new Date(lastMonday);
    date.setDate(lastMonday.getDate() + i);
    currentWeekDates.push(date.toDateString());
  }

  return currentWeekDates;
};


// Output: "2024-07-16 00:00:00" ( this formate )
export const dateFormate = (applyDate: any) => {

  // Create a Date object from the ISO date string
  let date = new Date(applyDate);

  // Format the date components
  let year = date.getUTCFullYear(); // Get the year
  let month = String(date.getUTCMonth() + 1).padStart(2, "0"); // Get the month (0-based, add 1)
  let day = String(date.getUTCDate()).padStart(2, "0"); // Get the day
  let hours = String(date.getUTCHours()).padStart(2, "0"); // Get the hours
  let minutes = String(date.getUTCMinutes()).padStart(2, "0"); // Get the minutes
  let seconds = String(date.getUTCSeconds()).padStart(2, "0"); // Get the seconds

  // Construct the formatted date string
  let formattedDateStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  // console.log(formattedDateStr);
  return formattedDateStr
};

export const twoDateDifferenceInDays = (currentDate: any, renewalDate: any) => {
    
  let timeDifference: any = currentDate - renewalDate;  

  let dayDifference = timeDifference / (1000 * 60 * 60 * 24);
  dayDifference = Math.round(dayDifference);
  // dayDifference = Math.floor(dayDifference);

  return dayDifference
}

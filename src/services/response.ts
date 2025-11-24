import { Response } from "express";

//200 OK
export const successResponse = (res: Response, data: any, msg: string) => {
  res.status(200).send({ data, msg });
};

//500 SERVER ERROR
export const serverError = (res: Response, err: any) => {
  const routePath = res.req?.route?.path;
  console.error('\x1b[31m' + `Error in route ${routePath}:` + '\x1b[0m', {
    message: err.message,
    stack: err.stack,
  });
  if (err.status == 400) {
    res.status(400).send(err.msg);
  } else if (err?.original?.errno === 1451) {
    res.status(409).send({ status: 0, msg: "Already in use" });
  } else if (err.status == 404) {
    res.status(404).send(err.msg);
  } else if (err.status == 401) {
    res.status(401).send(err.msg);
  } else if (err.status == 409) {
    res.status(409).send(err.msg);
  } else {
    res.status(500).send({ status: 0, msg: "Server error", err });
  }
};

//404 Not Found
// export const notFound = (res: Response, msg: string) => {
//   return { status: 404, msg }
// };

export const notFound = (res: Response, msg: string) => {
  return res.status(404).json({
    success: false,
    message: msg,
  });
};

//403 INACTIVE
export const inActive = (res: Response, msg: string, status: any) => {
  res.status(403).send({ status: status, msg: msg });
};


//401 Unauthorized
// export const unauthorized = (res: Response, msg: string) => {
//   return { status: 401, msg }
// };

export const unauthorized = (res: Response, message: string) => {
  return res.status(401).json({
    status: 401,
    msg: message,
  });
};

//400 Bad Request
export const other = (res: Response, msg: string) => {
  // res.status(400).send(msg);
  return { status: 400, msg }
};

//409 conflict (Used for duplicate values mainly)
export const alreadyExist = (res: Response, msg: string) => {
  return { status: 409, msg }
  // res.status(409).send(msg);
};

//422 fields required
export const requiredFields = (res: Response, err: any) => {
  res.status(422).json({ required: err });
};


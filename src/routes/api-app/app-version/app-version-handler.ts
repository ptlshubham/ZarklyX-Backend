import { AppVersion } from "./app-version-model";

//to get latest API Version
export const getAPIVersion = () => {
  return AppVersion.findOne({
    logging: false,
    order: [['id', 'DESC']],
    raw: true
  });
};

//to get all AppVersion
export const getAllAppVersion = () => {
  return AppVersion.findAll();
};

//to get AppVersion by id
export const getAppVersionByID = (params: any) => {
  return AppVersion.findOne({
    where: {
      id: params.id,
    },    
    raw: true,
  });
};

//to add AppVersion
export const addAppVersion = async (body: any, t: any) => {
  return AppVersion.create(body, { transaction: t });
};

//to update AppVersion
export const updateAppVersion = (body: any, params: any, t: any) => {
  return AppVersion.update(body, {
    where: { id: params.id },
    transaction: t
  });
};

//to delete AppVersion
export const deleteAppVersion = (params: any, t: any) => {
  return AppVersion.destroy({
    where: {
      id: params.id,
    },
    transaction: t
  });
};
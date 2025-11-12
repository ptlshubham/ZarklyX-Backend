import { Zones } from "./zones-model";

// Add a new employee
export const addZones = async (body: any, t: any) => {
    return await Zones.create(body, { transaction: t });
};
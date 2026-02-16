import { Warehouse } from "./warehouse-model";
import { Transaction } from "sequelize";


// Create Bulk Warehouse

export const createWarehouse = async(
    companyId: string,
    warehouseData: any,
    transaction?: Transaction
) => {

    return await Warehouse.create(
        {
            companyId,
            ...warehouseData
        },
        {
            transaction
        }
    )

};

// get all Warehouse by company id

export const  getAllWarehouse = async(
    companyId: string
) => {

    return await Warehouse.findAll({
        where : {
            companyId,
            isDeleted: false,
        },
        order : [["createdAt","DESC"]],
    })
}

// get Warehouse by id

export const getWarehouseById = async(
    id : string,
    companyId : string
) => {

    return await Warehouse.findOne({
        where : {
            id,
            companyId,
            isDeleted : false
        }
    });
};

// Update Warehouse 

export const updateWarehouse = async(
    id:string,
    companyId: string,
    body : any,
    t? : Transaction,
) => {

    const {name,code,address,isActive} = body

    await Warehouse.update({name,code,address,isActive},{
        where : {
            id,
            companyId,
            isDeleted: false,
        },
        transaction : t,
    });

    return await Warehouse.findOne({
        where: {
            id,
            companyId
        },
        transaction: t,
    });
}

// Soft Delete Warehouse

export const softDeleteWarehouse = async(
    id: string,
    companyId: string,
    t? : Transaction
) => {
    return await Warehouse.update({
        isDeleted: true,
        isActive: false
    },{
        where : {
            id,
            companyId,
        },
        transaction: t,
    })
}
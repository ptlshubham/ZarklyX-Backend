import { Op, Transaction } from "sequelize";
import { ItAssetsManagement } from "./it-Assets-Management-model";
import { ItemCategory } from "../../accounting/item-Category/item-Category-model";
import { Clients } from "../../agency/clients/clients-model";
import { Employee } from "../../agency/employee/employee-model";
import { User } from "../../authentication/user/user-model";
const ASSET_TYPE = ["Product", "Service"]
const PAYMENT_MODES = ["UPI", "Cash", "Card", "Cheque", "Net Banking", "RTGS", "Bank Transfer", "NEFT", "Other"]
const PAYMENT_STATUS = ["Paid", "Pending"]
const PURCHASED_BY = ["Company", "Client"]
const PAID_BY = ["Company", "Client"]

export function throwValidation(msg: string): never {
    const e = new Error(msg);
    e.name = "ValidationError";
    throw e;
}

export function validateEnum(value: any, validValues: string[], fieldName: string) {
    if (value && !validValues.includes(value)) {
        throwValidation(`Invalid ${fieldName}. Must be one of: ${validValues.join(", ")}`);
    }
}

export function validateAssetEnum(data: any) {
    validateEnum(data.assetType, ASSET_TYPE, "assetType");
    validateEnum(data.paymentMode, PAYMENT_MODES, "paymentMode");
    validateEnum(data.paymentStatus, PAYMENT_STATUS, "paymentStatus");
    validateEnum(data.purchasedBy, PURCHASED_BY, "purchasedBy");
    validateEnum(data.paidBy, PAID_BY, "paidBy");
}
function calculateRenewalReminderDate(
    expiryDate: Date,
    daysBefore = 30
) {
    const reminder = new Date(expiryDate);
    reminder.setDate(reminder.getDate() - daysBefore);
    return reminder;
}

function validateAssetDates(data: any, existing?: any) {

    const assetType = data.assetType || existing?.assetType;
    const purchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : existing?.purchaseDate;
    const startDate = data.startDate ? new Date(data.startDate) : existing?.startDate;
    const endDate = data.endDate ? new Date(data.endDate) : existing?.endDate;
    const warrantyStartDate = data.warrantyStartDate ? new Date(data.warrantyStartDate) : existing?.warrantyStartDate;
    const warrantyEndDate = data.warrantyEndDate ? new Date(data.warrantyEndDate) : existing?.warrantyEndDate;

    const renewalReminderDate = data.renewalReminderDate ? new Date(data.renewalReminderDate) : existing?.renewalReminderDate;


    if (assetType === "Service") {
        if (!startDate || !endDate) {
            throwValidation("Start date and End date are required for service assets.");
        }
    }

    if (assetType === "Product") {
        if (!startDate || !endDate || !purchaseDate || !warrantyStartDate || !warrantyEndDate) {
            throwValidation(
                "Start date, End date, Purchase date, Warranty start date and Warranty end date are required for product assets."
            );
        }
    }

    if (purchaseDate && startDate && purchaseDate > startDate) {
        throwValidation("Purchase date cannot be after start date.");
    }

    if (startDate && endDate && startDate > endDate) {
        throwValidation("Start date cannot be after end date.");
    }
    if (assetType === "Product") {
        if (warrantyStartDate && warrantyEndDate && warrantyStartDate > warrantyEndDate) {
            throwValidation("WarrantyStartDate cannot be after WarrantyEndDate.");
        }
        if (renewalReminderDate && warrantyEndDate && renewalReminderDate >= warrantyEndDate) {
            throwValidation("RenewalReminderDate cannot be after WarrantyEndDate.");
        }

        const isWarrantyOnlyUpdate = data.warrantyEndDate && !data.endDate;

        if (!isWarrantyOnlyUpdate && endDate && warrantyEndDate && warrantyEndDate > endDate) {
            throwValidation("Warranty end date cannot exceed asset end date.");
        }

    }

}
// CREATE-time enforcement: normalize full payload & derive defaults

function enforceAssetTypeRules(assetType: "Product" | "Service", assetData: any) {

    if (assetType === "Service") {
        if (!assetData.startDate || !assetData.endDate) {
            throw new Error("Start date and End date are required for service assets.");
        }
        assetData.purchaseDate = null;;
        assetData.warrantyStartDate = null;
        assetData.warrantyEndDate = null;
        if (assetData.endDate) {
            assetData.renewalReminderDate = calculateRenewalReminderDate(new Date(assetData.endDate), 30);
        }
    }
    else if (assetType === "Product") {
        if (!assetData.purchaseDate && assetData.startDate) {
            assetData.purchaseDate = assetData.startDate;
        }
        if (assetData.purchaseDate) {
            assetData.warrantyStartDate = assetData.purchaseDate;
        }
        if (assetData.warrantyEndDate) {
            assetData.renewalReminderDate = calculateRenewalReminderDate(new Date(assetData.warrantyEndDate), 30);
        }
    }
    return assetData;
}
// UPDATE-time enforcement: prevent illegal field updates & recalc derived fields

function enforceAssetTypeRulesOnUpdate(asset: any, allowedData: any) {
    if (asset.assetType === "Service") {
        delete allowedData.purchaseDate;
        delete allowedData.warrantyStartDate;
        delete allowedData.warrantyEndDate;

        if ("endDate" in allowedData) {
            allowedData.renewalReminderDate =
                allowedData.endDate
                    ? calculateRenewalReminderDate(new Date(allowedData.endDate), 30)
                    : null;
        }
    }

    if (asset.assetType === "Product") {
        delete allowedData.startDate;

        if ("warrantyEndDate" in allowedData) {
            allowedData.renewalReminderDate =
                allowedData.warrantyEndDate
                    ? calculateRenewalReminderDate(new Date(allowedData.warrantyEndDate), 30)
                    : null;
        }
    }
}


//create a new asset
export async function createItAssets(assetData: any, t: any) {
    if (!assetData.assetName || String(assetData.assetName).trim() === "") {
        throwValidation("Asset name is required");
    }
    if (!assetData.categoryId) {
        throwValidation("Category is required");
    }
    if (assetData.price !== undefined && assetData.price !== null) {
        const priceNum = Number(assetData.price);
        if (isNaN(priceNum) || priceNum < 0) {
            throwValidation("Price must be a valid positive number");
        }
    }
    validateAssetEnum(assetData);
    const category = await ItemCategory.findOne({
        where: {
            id: assetData.categoryId,
            companyId: assetData.companyId,
            isActive: true,
            isDeleted: false,
        },
        transaction: t,
    });

    if (!category) {
        throwValidation("Invalid or inactive category");
    }

    const userType = String(assetData.userType || "").toLowerCase();

    if (userType === "client") {
        const client = await Clients.findOne({
            where: { userId: assetData.userId, companyId: assetData.companyId, isDeleted: false },
            transaction: t,
        });
        if (!client) throwValidation("Client not found for given userId and companyId");
        assetData.clientId = client.id;
    } else if (userType === "employee") {
        const employee = await Employee.findOne({
            where: { userId: assetData.userId, companyId: assetData.companyId, isDeleted: false },
            transaction: t,
        });
        if (!employee) throwValidation("Employee not found for given userId and companyId");
        assetData.employeeId = employee.id;
        assetData.clientId = null;
    } else if (userType === "agency" ) {
        const user = await User.findOne({
            where: { id: assetData.userId, companyId: assetData.companyId, isDeleted: false },
            transaction: t,
        });
        if (!user) throwValidation("Agency user not found for given userId and companyId");
        assetData.clientId = null;
    } else if(userType === "freelancer") {
        throwValidation("Unsupported userType");
    }

    if (assetData.assetType === "Product" && category.categoryType !== "Product") {
        throwValidation("Product asset must use Product category");
    }
    if (assetData.assetType === "Service" && category.categoryType !== "Service") {
        throwValidation("Service asset must use Service category");
    }

    validateAssetDates(assetData);

    assetData = enforceAssetTypeRules(assetData.assetType, assetData);

    const price = Number(assetData.price || 0);
    let quantity = 1;
    if (assetData.assetType === "Product") {
        quantity = Number(assetData.quantity || 0);
        if (quantity <= 0) {
            throwValidation("Quantity is required for product assets.");
        }
    }

    const currencyCode = assetData.currencyCode || "INR";
    const totalAmount = assetData.assetType === "Service" ? price : price * quantity;

    const asset = await ItAssetsManagement.create({ ...assetData, currencyCode, renewalReminderDate: assetData.renewalReminderDate, quantity, totalAmount }, { transaction: t });
    const createdAsset = await ItAssetsManagement.findOne({
        where: {
            id: asset.id,
            isDeleted: false,
        },
        transaction: t,
    });

    if (!createdAsset) return null;

    const assetObj = createdAsset.get({ plain: true });

    return assetObj;
}

//get individual asset by id
export async function getItAssetsById(id: string, companyId: string) {
    return await ItAssetsManagement.findOne({
        where: {
            id: id,
            companyId: companyId,
            isDeleted: false
        },
        include: [{ association: "category" }, { association: "attachments" }],
    })
}


//get all assets company and client
export async function getAllItAssetsByCompanyAndClientId(filters: { companyId: string, clientId?: string, assetType?: string, categoryId?: string }) {
    const whereConditions: any = {
        companyId: filters.companyId,
        isDeleted: false
    };

    if (filters.clientId) {
        whereConditions.clientId = filters.clientId;
    }

    if (filters.categoryId) {
        whereConditions.categoryId = filters.categoryId;
    }

    if (filters.assetType) {
        whereConditions.assetType = filters.assetType;
    }

    return await ItAssetsManagement.findAll({
        where: whereConditions,
        include: [
            {
                association: "category",
                attributes: ["id", "categoryName"],
            },
            { association: "attachments" }
        ],
    });
}

//update asset details
export async function updateItAssetsDetails(id: string, companyId: string, assetData: any, t: any, clientId?: string,) {
    validateAssetEnum(assetData);
    const asset = await ItAssetsManagement.findOne({
        where: { id, companyId, isDeleted: false },
        transaction: t,
    });
    if (!asset) return null;


    validateAssetDates(assetData, asset);
    const allowedData: any = {
        assetName: assetData.assetName,
        paymentMode: assetData.paymentMode,
        purchasedBy: assetData.purchasedBy,
        paidBy: assetData.paidBy,
        price: assetData.price,
        quantity: assetData.quantity,
        currencyCode: assetData.currencyCode,
    };

    if (Object.keys(allowedData).length === 0) {
        throwValidation("No valid fields provided for update");
    }

    if (typeof assetData.isClientPaymentReceived === "string") {
        if (assetData.isClientPaymentReceived === "true") {
            assetData.isClientPaymentReceived = true;
        }
        else if (assetData.isClientPaymentReceived === "false") {
            assetData.isClientPaymentReceived = false;
        }
    }

    if ("isClientPaymentReceived" in assetData) {

        if (typeof assetData.isClientPaymentReceived !== "boolean") {
            throwValidation("Invalid value for client payment status");
        }

        if (!asset.clientId) {
            throwValidation(
                "Client payment status can only be updated for client assets."
            );
        }

        if (
            asset.purchasedBy !== "Company" ||
            asset.paidBy !== "Client"
        ) {
            throwValidation(
                "Client payment status can only be updated when purchasedBy is Company and paidBy is Client."
            );
        }

        allowedData.isClientPaymentReceived =
            assetData.isClientPaymentReceived;

        allowedData.paymentStatus = assetData.isClientPaymentReceived
            ? "Paid"
            : "Pending";
    }

    (Object.keys(allowedData) as (keyof typeof allowedData)[]).forEach(
        (key) => allowedData[key] === undefined && delete allowedData[key]
    );
    if (
        allowedData.price !== undefined ||
        allowedData.quantity !== undefined
    ) {
        const finalPrice =
            allowedData.price !== undefined
                ? Number(allowedData.price)
                : Number(asset.price || 0);

        let finalQuantity = asset.quantity || 1;
        if (asset.assetType === "Product") {
            finalQuantity =
                allowedData.quantity !== undefined
                    ? Number(allowedData.quantity)
                    : Number(asset.quantity || 0);

            if (finalQuantity <= 0) {
                throwValidation("Quantity is required for product assets");
            }
        }


        allowedData.totalAmount = asset.assetType === "Service" ? finalPrice : finalPrice * finalQuantity;
        allowedData.quantity = finalQuantity;
    }
    if ("currencyCode" in assetData) {
        if (
            typeof assetData.currencyCode !== "string" ||
            assetData.currencyCode.length !== 3
        ) {
            throwValidation("Invalid currency code");
        }
    }
    if (asset.assetType === "Product") {
        if ('endDate' in assetData) {
            if (assetData.endDate === "" || assetData.endDate === null) {
                allowedData.endDate = null;
            } else {
                const end = new Date(assetData.endDate);
                if (isNaN(end.getTime())) {
                    throwValidation("Invalid endDate");
                }
                allowedData.endDate = end;
            }
        }

        if ('warrantyEndDate' in assetData) {
            if (assetData.warrantyEndDate === "" || assetData.warrantyEndDate === null) {
                allowedData.warrantyEndDate = null;
            } else {
                const wEnd = new Date(assetData.warrantyEndDate);
                if (isNaN(wEnd.getTime())) {
                    throwValidation("Invalid warrantyEndDate");
                }
                allowedData.warrantyEndDate = wEnd;
            }
        }

        if ('purchaseDate' in assetData) {
            allowedData.purchaseDate =
                assetData.purchaseDate === "" || assetData.purchaseDate === null
                    ? null
                    : new Date(assetData.purchaseDate);

            if (allowedData.purchaseDate && isNaN(allowedData.purchaseDate.getTime())) {
                throwValidation("Invalid purchaseDate");
            }
        }

        if ('warrantyStartDate' in assetData) {
            allowedData.warrantyStartDate =
                assetData.warrantyStartDate === "" || assetData.warrantyStartDate === null
                    ? null
                    : new Date(assetData.warrantyStartDate);

            if (
                allowedData.warrantyStartDate &&
                isNaN(allowedData.warrantyStartDate.getTime())
            ) {
                throwValidation("Invalid warrantyStartDate");
            }
        }
    }

    if (asset.assetType === "Service") {
        if ('startDate' in assetData) {
            if (assetData.startDate === "" || assetData.startDate === null) {
                allowedData.startDate = null;
            } else {
                const start = new Date(assetData.startDate);
                if (isNaN(start.getTime())) {
                    throwValidation("Invalid startDate");
                }
                allowedData.startDate = start;
            }
        }

        if ('endDate' in assetData) {
            if (assetData.endDate === "" || assetData.endDate === null) {
                allowedData.endDate = null;
            } else {
                const end = new Date(assetData.endDate);
                if (isNaN(end.getTime())) {
                    throwValidation("Invalid endDate");
                }
                allowedData.endDate = end;
            }
        }
    }


    if (asset.assetType === "Product" && allowedData.warrantyEndDate) {
        const oldWarrantyEnd = asset.warrantyEndDate ? new Date(asset.warrantyEndDate).getTime() : 0;
        const newWarrantyEnd = new Date(allowedData.warrantyEndDate).getTime();

        if (newWarrantyEnd > oldWarrantyEnd) {
            allowedData.lastReminderSentAt = null;
            allowedData.isRenewalReminderSent = false;
        }
    }

    if (asset.assetType === "Service" && allowedData.endDate) {
        const oldEndDate = asset.endDate ? new Date(asset.endDate).getTime() : 0;
        const newEndDate = new Date(allowedData.endDate).getTime();


        if (newEndDate > oldEndDate) {
            allowedData.lastReminderSentAt = null;
            allowedData.isRenewalReminderSent = false;
        }
    }

    enforceAssetTypeRulesOnUpdate(asset, allowedData);

    await asset.update(allowedData, { transaction: t });


    const updatedAsset = await ItAssetsManagement.findOne({
        where: { id, companyId, isDeleted: false },
        include: [{ association: "category" }],
        transaction: t,
    });

    if (!updatedAsset) return null;

    const assetObj = updatedAsset.get({ plain: true });

    return assetObj;
}

//soft delete asset by id
export async function deleteItAssetsById(id: string, companyId: string, t: Transaction) {
    const asset = await ItAssetsManagement.findOne({
        where: {
            id: id, companyId: companyId, isDeleted: false
        }
        ,
        transaction: t
    });
    if (!asset) return null;
    await ItAssetsManagement.update(
        { isDeleted: true },
        {
            where: {
                id: id,
                companyId: companyId,
                isDeleted: false
            },
            transaction: t
        }
    );
    return asset;
}


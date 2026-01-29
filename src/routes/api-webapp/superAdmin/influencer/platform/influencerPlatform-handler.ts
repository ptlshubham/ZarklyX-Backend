import { Platform } from "./influencerPlatform-model";

// add new influencer platform
export const createInfluencerPlatform = async (body: any, t:any) => {
    return await Platform.create(body, { transaction: t});
};

//get all influencer platform
export const getAllInfluencerPlatform = async (body: any, t:any) => {
    return await Platform.findAll({
        order: [['createdAt', 'DESC']] // Newest first
    });
};

//get influencer platform by id
export const getInfluencerPlatformById = async (id: string) => {
    return await Platform.findOne({
        where: { id },
        raw: true,
    });
};

//get all active influencer platform
export const getActiveInfluencerPlatform = async (body: any, t:any) => {
    return await Platform.findAll({
        where: {
            isActive: true,
        },
        order: [['name', 'ASC']], // Alphabetical order
        raw: true,
    });
};

//update influencer platform
export const updateInfluencerPlatform = async (id: string, body: any, t:any) => {
    return await Platform.update(
        body,
        { where:{id}, transaction: t }
    );
};

//soft delete influencer platform
export const softDeleteInfluencerPlatform = async (id: string, t:any) => {
    return await Platform.update(
        { isActive:false },
        { where:{id}, transaction: t }
    );
};

//activate influencer platform
export const setActiveInfluencerPlatform = async (id: string, t:any) => {
    return await Platform.update(
        { isActive:true },
        { where:{id}, transaction: t }
    );
};

//hard delete influencer platform
export const hardDeleteInfluencerPlatform = async (id: string, t:any) => {
    return await Platform.destroy(
        { where:{id}, transaction: t }
    );
};

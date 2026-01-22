import { Industry } from "./influencerIndustry-models";

// add new influencer category
export const createInfluencerIndustry = async (body: any, t:any) => {
    return await Industry.create(body, { transaction: t});
};

//get all influencer category
export const getAllInfluencerIndustry = async (body: any, t:any) => {
    return await Industry.findAll({
        order: [['createdAt', 'DESC']] // Newest first
    });
};

//get influencer category by id
export const getInfluencerIndustryById = async (id: string) => {
    return await Industry.findOne({
        where: { id },
        raw: true,
    });
};

//get all active influencer category
export const getActiveInfluencerIndustry = async (body: any, t:any) => {
    return await Industry.findAll({
        where: {
            isActive: true,
        },
        order: [['name', 'ASC']], // Alphabetical order
        raw: true,
    });
};

//update influencer category
export const updateInfluencerIndustry = async (id: string, body: any, t:any) => {
    return await Industry.update(
        body,
        { where:{id}, transaction: t }
    );
};

//soft delete influencer category
export const softDeleteInfluencerIndustry = async (id: string, t:any) => {
    return await Industry.update(
        { isActive:false },
        { where:{id}, transaction: t }
    );
};

//activate influencer category
export const setActiveInfluencerIndustry = async (id: string, t:any) => {
    return await Industry.update(
        { isActive:true },
        { where:{id}, transaction: t }
    );
};

//hard delete influencer category
export const hardDeleteInfluencerIndustry = async (id: string, t:any) => {
    return await Industry.destroy(
        { where:{id}, transaction: t }
    );
};
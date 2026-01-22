import { where } from "sequelize";
import { InfluencerCategory } from "./influencerCategory-model"

// add new influencer category
export const createInfluencerCategory = async (body: any, t:any) => {
    return await InfluencerCategory.create(body, { transaction: t});
};

//get all influencer category
export const getAllInfluencerCategory = async (body: any, t:any) => {
    return await InfluencerCategory.findAll({
        order: [['createdAt', 'DESC']] // Newest first
    });
};

//get influencer category by id
export const getInfluencerCategoryById = async (id: string) => {
    return await InfluencerCategory.findOne({
        where: { id },
        raw: true,
    });
};

//get all active influencer category
export const getActiveInfluencerCategory = async (body: any, t:any) => {
    return await InfluencerCategory.findAll({
        where: {
            isActive: true,
        },
        order: [['name', 'ASC']], // Alphabetical order
        raw: true,
    });
};

//update influencer category
export const updateInfluencerCategory = async (id: string, body: any, t:any) => {
    return await InfluencerCategory.update(
        body,
        { where:{id}, transaction: t }
    );
};

//soft delete influencer category
export const softDeleteInfluencerCategory = async (id: string, t:any) => {
    return await InfluencerCategory.update(
        { isActive:false },
        { where:{id}, transaction: t }
    );
};

//activate influencer category
export const setActiveInfluencerCategory = async (id: string, t:any) => {
    return await InfluencerCategory.update(
        { isActive:true },
        { where:{id}, transaction: t }
    );
};

//hard delete influencer category
export const hardDeleteInfluencerCategory = async (id: string, t:any) => {
    return await InfluencerCategory.destroy(
        { where:{id}, transaction: t }
    );
};
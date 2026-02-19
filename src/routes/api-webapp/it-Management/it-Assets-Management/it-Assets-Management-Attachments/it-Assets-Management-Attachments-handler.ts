import { ItAssetsManagement } from "../it-Assets-Management-model";
import { ItAssetsAttachments } from "./it-Assets-Management-Attachments-model";
import { Transaction } from "sequelize";
import path from "path";
import fs from "fs";
//create attachments for an asset
export async function createItAssetsAttachments(
  assetId: string,
  attachmentPaths: string[],
  t: Transaction
) {
  if (!attachmentPaths || attachmentPaths.length === 0) return [];

  const assetExists = await ItAssetsManagement.findByPk(assetId, { transaction: t });
  if (!assetExists) {
    throw new Error("Asset not found");
  }

  const records = attachmentPaths.map((path) => ({
    itAssetId: assetId,
    attachmentPath: path,
  }));

  return await ItAssetsAttachments.bulkCreate(records, {
    transaction: t,
  });
}

//remove attachment of asset by user
export async function removeItAssetsAttachmentByUser(
  assetId:string,
  companyId: string,
  attachmentId: string,
  t: Transaction
) {
  const asset=await ItAssetsManagement.findOne({
    where:{id:assetId,companyId,isDeleted:false},
    transaction:t,
  })
  if(!asset) return null;
  const attachment = await ItAssetsAttachments.findOne({
    where: { id: attachmentId, itAssetId:assetId},
    transaction: t,
  });

  if (!attachment) return null;

  const absolutePath = path.join(
    process.cwd(),
    "src",
    "public",
    attachment.attachmentPath
  );

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }

  await attachment.destroy({ transaction: t });
  return {id:attachmentId};
}
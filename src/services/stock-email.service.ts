import { sendEmail } from "./mailService";
import { Company } from "../routes/api-webapp/company/company-model";
import { Warehouse } from "../routes/api-webapp/inventory-management/warehouse/warehouse-model";
import { Item } from "../routes/api-webapp/accounting/item/item-model"

// Get Company email by company id

const getCompanyEmail = async (companyId: string): Promise<String | null> => {
  try {

    const company = await Company.findByPk(companyId, {
      attributes: ["email"],
    });

    return company?.email || null;

  } catch (error: any) {
    console.error("Error fetching company details : ", error);
    return null
  }
}
  
// Send inward email

export const sendInwardEmail = async (data: {
  companyId: string;
  warehouses: Record<string, any[]>;
}): Promise<void> => {
  try {

    let warehouseSections = "";

    for (const warehouseId of Object.keys(data.warehouses)) {
      const warehouse = await Warehouse.findByPk(warehouseId);
      const warehouseName = warehouse?.name || "Warehouse";

      const items = data.warehouses[warehouseId];
      const itemsData = await Promise.all(
        items.map((item) => Item.findByPk(item.itemId))
      );

      const rows = items
        .map((item, index) => {
          const itemName = itemsData[index]?.itemName || "Item";
          return `
        <tr>
          <td>${itemName}</td>
          <td>${item.quantity}</td>
          <td>₹${item.rate}</td>
          <td>₹${(item.quantity * item.rate).toFixed(2)}</td>
          <td>${item.batchNumber || "-"}</td>
          <td>${item.referenceNumber || "-"}</td>
        </tr>
      `;
        })
        .join("");

      warehouseSections += `
        <h3>Warehouse: ${warehouseName}</h3>
        <table border="1" cellpadding="8" style="border-collapse: collapse; width:100%">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Batch</th>
              <th>Ref</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <br/>
      `;
    }

    const to = await getCompanyEmail(data.companyId);
    if (!to) return;

    await sendEmail({
      from: "" as any,
      to: to as any,
      subject: `[STOCK INWARD] New stock inward recorded`,
      html: `
        <h2>Stock Inward Summary</h2>
        ${warehouseSections}
        <p style="font-size:12px;color:#666">
          This is an automated notification.
        </p>
      `,
      text : 'Stock inward recorded',
      replacements: null,
      htmlFile: "" as any,
      attachments: null,
      cc: null,
      replyTo: null,
    });


    //console.log(`[INWARD EMAIL] Sent to: ${to}`);
  } catch (error) {
    //console.error("[INWARD EMAIL] Error:", error);
  }
};

// Send outward email
export const sendOutwardEmail = async (data: {
  companyId: string;
  warehouses: Record<
    string,
    {
      itemId: string;
      quantity: number;
      remainingStock: number;
      referenceNumber?: string;
    }[]
  >;
}) => {
  try {
    const to = await getCompanyEmail(data.companyId);
    if (!to) return;

    let sections = "";

    for (const warehouseId of Object.keys(data.warehouses)) {
      const warehouse = await Warehouse.findByPk(warehouseId);
      const warehouseName = warehouse?.name || "Warehouse";

      const items = data.warehouses[warehouseId];
      const itemsData = await Promise.all(
        items.map((i) => Item.findByPk(i.itemId))
      );

      const rows = items
        .map((item, index) => `
          <tr>
            <td>${itemsData[index]?.itemName || "Item"}</td>
            <td>${item.quantity}</td>
            <td>${item.remainingStock}</td>
            <td>${item.referenceNumber || "-"}</td>
          </tr>
        `)
        .join("");

      sections += `
        <h3>Warehouse: ${warehouseName}</h3>
        <table border="1" cellpadding="8" width="100%" style="border-collapse:collapse">
          <tr>
            <th>Item</th>
            <th>Quantity Removed</th>
            <th>Remaining Stock</th>
            <th>Reference</th>
          </tr>
          ${rows}
        </table><br/>
      `;
    }

    await sendEmail({
      from: "" as any,
      to : to as any,
      subject: `[STOCK OUTWARD] Stock removed from warehouses`,
      html: `<h2>Stock Outward Summary</h2>${sections}`,
      text: "Stock outward recorded",
      replacements: null,
      htmlFile: "" as any,
      attachments: null,
      cc: null,
      replyTo: null,
    });

    //console.log(`[OUTWARD EMAIL] Sent to: ${to}`);
  } catch (error) {
    //console.error("[OUTWARD EMAIL ERROR]", error);
  }
};

// Send adjustment email

export const sendAdjustmentEmail = async (data: {
  companyId: string;
  warehouses: Record<
    string,
    {
      itemId: string;
      adjustmentType: "INCREASE" | "DECREASE";
      quantity: number;
      reason?: string;
      previousBalance: number;
      currentBalance: number;
    }[]
  >;
}) => {
  try {
    const to = await getCompanyEmail(data.companyId);
    if (!to) return;

    let sections = "";

    for (const warehouseId of Object.keys(data.warehouses)) {
      const warehouse = await Warehouse.findByPk(warehouseId);
      const warehouseName = warehouse?.name || "Warehouse";

      const items = data.warehouses[warehouseId];
      const itemsData = await Promise.all(
        items.map((i) => Item.findByPk(i.itemId))
      );

      const rows = items
        .map((item, index) => `
          <tr>
            <td>${itemsData[index]?.itemName || "Item"}</td>
            <td>${item.adjustmentType}</td>
            <td>${item.adjustmentType === "INCREASE" ? "+" : "-"}${item.quantity}</td>
            <td>${item.previousBalance}</td>
            <td><b>${item.currentBalance}</b></td>
            <td>${item.reason || "-"}</td>
          </tr>
        `)
        .join("");

      sections += `
        <h3>Warehouse: ${warehouseName}</h3>
        <table border="1" cellpadding="8" width="100%" style="border-collapse:collapse">
          <tr>
            <th>Item</th>
            <th>Type</th>
            <th>Change</th>
            <th>Previous</th>
            <th>Current</th>
            <th>Reason</th>
          </tr>
          ${rows}
        </table><br/>
      `;
    }

    await sendEmail({
      from: "" as any,
      to : to as any,
      subject: `[STOCK ADJUSTMENT] Stock adjusted across warehouses`,
      html: `<h2>Stock Adjustment Summary</h2>${sections}`,
      text: "Stock adjustment recorded",
      replacements: null,
      htmlFile: "" as any,
      attachments: null,
      cc: null,
      replyTo: null,
    });

    //console.log(`[ADJUSTMENT EMAIL] Sent to: ${to}`);

  } catch (error) {
    //console.error("[ADJUSTMENT EMAIL ERROR]", error);
  }
};


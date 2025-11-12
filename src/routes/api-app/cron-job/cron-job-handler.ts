// import { format, getMonth, getYear, parseISO } from "date-fns";
// import Razorpay from "razorpay";
import { Op } from "sequelize";
import configs from "../../../config/config";
import CronLogger from "../../../db/core/logger/cron-logger";
import ErrorLogger from "../../../db/core/logger/error-logger";
import environment, { env } from "../../../../environment";
// import { formatDate } from "../../../services/date-service";
import { sendEmail } from "../../../services/mailService";
import { GLOBAL_CONSTANTS } from "../../../utils/constants";
// import { AssignEv } from "../assign-ev/assign-ev-model";
// import { findCustomerPlanForPayment, getCustomerDetailDataById, updateCustomerPlanDetail } from "../customer-master/customer-master-handler";
// import { Customer } from "../customer-master/customer-master-model";
// import { CustomerPlanDetail } from "../customer-master/customer-plan-detail-model";
// import { FnYear } from "../fnYear/fnYear-model";
// import { sendUserNotification } from "../notification/notification-handler";
// import { generateInvoice, getPaymentByOrderID, getPaymentByOrderNo, updatePaymentData, updateSettlementsID } from "../payment/payment-handler";

const config = (configs as { [key: string]: any })[environment];

// let razorPayKeys = GLOBAL_CONSTANTS.razorPay;

if (environment === env.staging || environment === env.development) {
//   razorPayKeys = GLOBAL_CONSTANTS.razorPayTesting;
};

// const instance = new Razorpay(razorPayKeys);

//to get customerplandetail list for renewal
export const getAllRenewalCustomer = () => {
  return CustomerPlanDetail.findAll({
    where: { isActive: 1, isPayment: GLOBAL_CONSTANTS.paymentStatus.success, isEvActived: 1 },
    attributes: ['id', 'customerId', 'isPayment', 'startDate', 'renewalDate', 'isActive', 'isEvActived'],
    raw: true
  })
}

//to get customerplandetail list for pickup 
export const getAllCustomerForPickup = () => {
  return CustomerPlanDetail.findAll({
    where: { isActive: 1, isPayment: GLOBAL_CONSTANTS.paymentStatus.success, isEvActived: 0 },
    attributes: ['id', 'customerId', 'isPayment', 'startDate', 'renewalDate', 'isActive', 'isEvActived'],
    raw: true
  })
}

//to get customerplandetail list for pickup 
export const getAllCustomerAssignEvPending = () => {
  let d = new Date();
  let minusDate = d.setDate(d.getDate() - 2);
  let formated = formatDate(minusDate, 'y-m-d');
  let newDate: any = `${formated}T00:00:00.000`;
  return AssignEv.findAll({
    where: {
      isActive: 1,
      status: GLOBAL_CONSTANTS.assignEvStatus.pending,
      createdAt: { [Op.lt]: newDate }
    },
    attributes: ['id', 'batteryId', 'chassisNo'],
    include: [{
      model: Customer,
      attributes: ['firstName', 'lastName', 'mobileNo', 'email']
    }],
    raw: true
  })
}

// cron-job function for payment reminder at renewal time
export const renewalReminder = async () => {

  const customerData: any = await getAllRenewalCustomer();
  const currentDate = new Date();
  const nextDate = new Date(currentDate);
  nextDate.setDate(currentDate.getDate() + 1);

  const lessThanCurrentDate: any = [];
  const equalToCurrentDate: any = [];
  const greaterThanCurrentDate: any = [];

  if (customerData && customerData.length > 0) {
    customerData.forEach((entry: any) => {
      const renewalDate = new Date(entry.renewalDate);

      const renewalDateString = renewalDate.toISOString().split('T')[0];
      const currentDateString = currentDate.toISOString().split('T')[0];
      const nextDateString = nextDate.toISOString().split('T')[0];

      if (renewalDateString < currentDateString) {
        lessThanCurrentDate.push(entry.customerId);
      } else if (renewalDateString === currentDateString) {
        equalToCurrentDate.push(entry.customerId);
      } else if (renewalDateString === nextDateString) {
        greaterThanCurrentDate.push(entry.customerId);
      }
    });
  };

  if (greaterThanCurrentDate && greaterThanCurrentDate.length > 0) {
    for (let id of greaterThanCurrentDate) {
      const notificationPayload = {
        title: "Plan Renewal Reminder",
        body: `Your current plan will expire tommorow.`,
      };
      await sendUserNotification(id, { notification: notificationPayload });
    }
  };

  if (equalToCurrentDate && equalToCurrentDate.length > 0) {
    for (let id of equalToCurrentDate) {
      const notificationPayload = {
        title: "Plan Renewal Reminder",
        body: `Your current plan will expire today.`,
      };
      await sendUserNotification(id, { notification: notificationPayload });
    }
  };

  if (lessThanCurrentDate && lessThanCurrentDate.length > 0) {
    for (let id of lessThanCurrentDate) {
      const notificationPayload = {
        title: "Plan Renewal Reminder",
        body: `Your plan is expired please renew.`,
      };
      await sendUserNotification(id, { notification: notificationPayload });
    }
  };
}

// cron-job function for ev pick-up reminder
export const evPickReminder = async () => {
  const customerData: any = await getAllCustomerForPickup();
  if (customerData && customerData.length > 0) {
    customerData.forEach(async (entry: any) => {
      const notificationPayload = {
        title: "EV Pick-up Reminder",
        body: `Please pick up your electric vehicle (EV).`,
      };
      await sendUserNotification(entry.customerId, { notification: notificationPayload });
    });
  };
};

// cron-job function for ev pick-up reminder
export const evPendingReminder = async () => {
  if (environment === env.production) {
    const customerData: any = await getAllCustomerAssignEvPending();
    // let users = await getAllGroundStaffDropdown();

    // let usersArray: any = []
    // for (let i = 0; i < users.length; i++) { usersArray.push(users[i].email) };

    if (customerData && customerData.length > 0) {
      customerData.forEach(async (entry: any) => {
        const mailData: any = {
          // to: usersArray,
          to: 'greenboltev@gmail.com',
          subject: `Green-Bolt Pending Pick-Up EV`,
          html: `<p> Battery ID: <strong>${entry?.batteryId}</strong></p>
        <p> Name: <strong>${entry?.['Customer.firstName']} ${entry?.['Customer.lastName']}</strong></p>
        <p> Mobile: <strong>${entry?.['mobileNo']}</strong></p>
        <p> Vehicle/Chassis No: <strong>${entry?.chassisNo}</strong></p>`
        };
        await sendEmail(mailData);
      });
    };
  };
};

export const settleRazorpayPayments = () => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const month = getMonth(yesterday) + 1;
    const year = getYear(yesterday);
    const day = yesterday.getDate();

    const options = {
      year: year,
      month: month,
      day: day,
    };
    instance.settlements.reports(options, async function (err: any, data: any) {
      if (err) {
        console.log("razor settlements error", err);
      } else {
        if (data?.items && data?.items.length > 0) {
          const paymentIds = data?.items.map((item: any) => {
            return item.entity_id;
          });
          const obj = {
            settlementsId: data.items[0]?.settlement_id,
            settlementsDate: new Date(data.items[0]?.settled_at * 1000),
          };
          await updateSettlementsID(paymentIds, obj);
        }
      }
    });
  } catch (error) {
    console.log(error);
  }
};

export const paymentsCallBack = async () => {
  try {
    const date = new Date();
    const to = parseISO(format(date, "yyyy-MM-dd")).getTime();
    const from = parseISO(format(date.setDate(date.getDate() - 1), "yyyy-MM-dd")).getTime();

    const options = {
      from: from / 1000,
      to: to / 1000,
      count: 100,
    };

    instance.payments.all(options, async function (err: any, data: any) {
      if (err) {
        console.log("razor settlements error", err);
      } else {
        const getAllOrderId = data.items
          .map((item: any) => {
            if (item.status == "captured") {
              return item.order_id;
            }
          })
          .filter((value: any) => value !== undefined);

        let paymentData = await getPaymentByOrderID(getAllOrderId);

        paymentData = JSON.parse(JSON.stringify(paymentData));

        const getallCreatePayment = paymentData.filter((row) => {
          return row.status == "created";
        });

        if (getallCreatePayment && getallCreatePayment.length > 0) {
          CronLogger.write({ type: `CronLogger(getallCreatePayment) - ${new Date()}`, data: `${JSON.stringify(getallCreatePayment)}` });
          CronLogger.write({ type: `CronLogger(data) - ${new Date()}`, data: `${JSON.stringify(data)}` });
          await updatePaymentStatus(getallCreatePayment, data.items);
        }
      }
    });
  } catch (error) {
    console.log(error);
  }
};

const updatePaymentStatus = async (data: any, payments: any) => {
  try {

    for (const item of data) {
      const getCusPlanPayment = payments.find((row: any) => {
        return row.order_id == item.orderNo;
      });
      const planData: any = {
        orderNo: getCusPlanPayment.order_id,
        paymentId: getCusPlanPayment.id,
        status: "Success",
      };
      planData.paymentMode = getCusPlanPayment.method;

      if (getCusPlanPayment.method == "upi") {
        planData.paymentMode = "Unified Payments";
      }

      CronLogger.write({ type: `CronLogger[planData] - ${new Date()}`, data: `${JSON.stringify(planData)}` });

      await updatePaymentData(planData);
      let paymentData: any = await getPaymentByOrderNo(planData);

      let customerDetail: any = await getCustomerDetailDataById(paymentData?.customerDetailId);
      customerDetail = JSON.parse(JSON.stringify(customerDetail));

      let cusPlanDetail: any = await findCustomerPlanForPayment(customerDetail.customerId);
      if (cusPlanDetail) {
        cusPlanDetail = JSON.parse(JSON.stringify(cusPlanDetail));
        let updateData = { isActive: 0 };
        await updateCustomerPlanDetail(updateData, { id: cusPlanDetail.id });
      }

      let updateObj: any = {
        dateOfPayment: item.paymentDate,
        isPayment: GLOBAL_CONSTANTS.paymentStatus.success,
        isActive: 1,
        isEvActived: cusPlanDetail ? 1 : 0
      };
      CronLogger.write({ type: `CronLogger[updateObj] - ${new Date()}`, data: `${JSON.stringify(updateObj)}` });

      await updateCustomerPlanDetail(updateObj, { id: item?.customerDetailId });

      await generateInvoice(item);
    }
  } catch (error) {
    ErrorLogger.write({ type: `CronLogger[error] - ${new Date()}`, error });

  }
};

export const addNewFNYear = async () => {
  try {
    // let dd = await FnYear.findAll({raw: true});
    // console.log(dd,"HHHHHHHHHHHHHHHH");

    await FnYear.update({ IsCurrent: 0 }, { where: {} });
    const now = new Date();
    const startYear = now.getFullYear();
    const endYear = startYear + 1;

    const startDate = `${startYear}-04-01T00:00:00.000Z`;
    const endDate = `${endYear}-03-31T23:59:59.999Z`;
    const financialYear = `${startYear}-${endYear.toString().slice(-2)}`;

    const payload = {
      FNYear: financialYear,
      FromDate: startDate,
      ToDate: endDate,
      IsCurrent: 1,
      IsDelete: 0,
    };

    // console.log(payload,">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
    await FnYear.create(payload);

  } catch (error) {
    ErrorLogger.write({ type: `CronLogger[error](addNewFNYear) - ${new Date()}`, error });
  }
}

export const testCronJob = async () => {
  try {
    
    const result = await instance.orders.fetchPayments('order_PlGZY2Vg4w3LMt');
    console.log('Order details:', result);
  } catch (error) {
    console.error('Error fetching order:', error);

    ErrorLogger.write({ type: `CronLogger[error](testCronJob) - ${new Date()}`, error });
  }
}
import { getallSeoUrl } from './seo-data-handler'
import express, { Request, Response } from 'express';
import { serverError } from '../../../../utils/responseHandler';

const router = express.Router();

//get all url which is analyzed
router.get('/all-url', async (req: Request, res: Response): Promise<any> => {
  try {
    const data = await getallSeoUrl();
    res.status(200).json({
      success: true,
      message: "all url successfully",
      data
    });
  } catch (error: any) {
    serverError(res, error.message || "something went wrong during fetching urls from seo");
  }
})

export default router;
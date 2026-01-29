import { seo } from '../seo-model';
export const getallSeoUrl = async () => {
  return await seo.findAll({
      attributes: [
      'id',
      'url'
    ],
    raw: true,
  });
};

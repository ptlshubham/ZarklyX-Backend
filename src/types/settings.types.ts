import { Settings } from '../routes/api-app/settings/settings-model';
import { InferCreationAttributes } from 'sequelize';

export type DocumentPayload = Partial<InferCreationAttributes<Settings>>;

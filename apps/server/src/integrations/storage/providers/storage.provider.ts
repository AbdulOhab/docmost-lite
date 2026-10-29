import {
  STORAGE_CONFIG_TOKEN,
  STORAGE_DRIVER_TOKEN,
} from '../constants/storage.constants';
import { EnvironmentService } from '../../environment/environment.service';
import { StorageConfig, StorageDriver, StorageOption } from '../interfaces';
import { LocalDriver } from '../drivers';
import { LOCAL_STORAGE_PATH } from '../../../common/helpers';

export const storageDriverConfigProvider = {
  provide: STORAGE_CONFIG_TOKEN,
  useFactory: async (environmentService: EnvironmentService) => {
    const driver = environmentService.getStorageDriver().toLowerCase();

    if (driver !== StorageOption.LOCAL) {
      throw new Error(
        `Unsupported storage driver: ${driver}. Only "local" is available.`,
      );
    }

    return {
      driver,
      config: {
        storagePath: LOCAL_STORAGE_PATH,
      },
    };
  },

  inject: [EnvironmentService],
};

export const storageDriverProvider = {
  provide: STORAGE_DRIVER_TOKEN,
  useFactory: (config: StorageConfig) => new LocalDriver(config.config),
  inject: [STORAGE_CONFIG_TOKEN],
};

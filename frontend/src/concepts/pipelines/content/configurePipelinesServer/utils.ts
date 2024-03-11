import { createSecret, assembleSecret } from '~/api';
import { DSPipelineKind } from '~/k8sTypes';
import { AwsKeys, PIPELINE_AWS_FIELDS } from '~/pages/projects/dataConnections/const';
import { dataEntryToRecord } from '~/utilities/dataEntryToRecord';
import { EnvVariableDataEntry } from '~/pages/projects/types';
import { DSPA_SECRET_NAME, DatabaseConnectionKeys, ExternalDatabaseSecret } from './const';
import { PipelineServerConfigType } from './types';

type SecretsResponse = [
  (
    | {
        key: string;
        name: string;
      }
    | undefined
  ),
  {
    secretName: string;
  },
];

const createDatabaseSecret = (
  databaseConfig: PipelineServerConfigType['database'],
  projectName: string,
  dryRun: boolean,
): Promise<
  | {
      key: string;
      name: string;
    }
  | undefined
> => {
  if (!databaseConfig.useDefault) {
    const secretKey = ExternalDatabaseSecret.KEY;
    const databaseRecord = databaseConfig.value.reduce<Record<string, string>>(
      (acc, { key, value }) => ({ ...acc, [key]: value }),
      {},
    );
    const assembledSecret = assembleSecret(
      projectName,
      {
        [secretKey]: databaseRecord[DatabaseConnectionKeys.PASSWORD],
      },
      'generic',
      ExternalDatabaseSecret.NAME,
    );

    return createSecret(assembledSecret, { dryRun }).then((secret) => ({
      key: secretKey,
      name: secret.metadata.name,
    }));
  }

  return Promise.resolve(undefined);
};

const createObjectStorageSecret = (
  objectStorageConfig: PipelineServerConfigType['objectStorage'],
  projectName: string,
  dryRun: boolean,
): Promise<{
  secretName: string;
}> => {
  const awsRecord = dataEntryToRecord(objectStorageConfig.newValue);
  const assembledSecret = assembleSecret(
    projectName,
    {
      [AwsKeys.ACCESS_KEY_ID]: awsRecord[AwsKeys.ACCESS_KEY_ID] ?? '',
      [AwsKeys.SECRET_ACCESS_KEY]: awsRecord[AwsKeys.SECRET_ACCESS_KEY] ?? '',
    },
    'generic',
    DSPA_SECRET_NAME,
  );

  return createSecret(assembledSecret, { dryRun }).then((secret) => ({
    secretName: secret.metadata.name,
  }));
};

const createSecrets = (config: PipelineServerConfigType, projectName: string) =>
  new Promise<SecretsResponse>((resolve, reject) => {
    Promise.all([
      createDatabaseSecret(config.database, projectName, true),
      createObjectStorageSecret(config.objectStorage, projectName, true),
    ])
      .then(() => {
        Promise.all([
          createDatabaseSecret(config.database, projectName, false),
          createObjectStorageSecret(config.objectStorage, projectName, false),
        ])
          .then((resp) => resolve(resp))
          .catch(reject);
      })
      .catch(reject);
  });

export const createDSPipelineResourceSpec = (
  config: PipelineServerConfigType,
  [databaseSecret, objectStorageSecret]: SecretsResponse,
): DSPipelineKind['spec'] => {
  const databaseRecord = dataEntryToRecord(config.database.value);
  const awsRecord = dataEntryToRecord(config.objectStorage.newValue);
  const [, externalStorageScheme, externalStorageHost] =
    awsRecord.AWS_S3_ENDPOINT?.match(/^(?:(\w+):\/\/)?(.*)/) ?? [];

  return {
    dspVersion: 'v2',
    objectStorage: {
      externalStorage: {
        host: externalStorageHost.replace(/\/$/, '') || '',
        scheme: externalStorageScheme || 'https',
        bucket: awsRecord.AWS_S3_BUCKET || '',
        region: 'us-east-2', // TODO hardcode for now
        s3CredentialsSecret: {
          accessKey: AwsKeys.ACCESS_KEY_ID,
          secretKey: AwsKeys.SECRET_ACCESS_KEY,
          secretName: objectStorageSecret.secretName,
        },
      },
    },
    database: databaseSecret
      ? {
          externalDB: {
            host: databaseRecord[DatabaseConnectionKeys.HOST],
            passwordSecret: {
              key: databaseSecret.key,
              name: databaseSecret.name,
            },
            pipelineDBName: databaseRecord[DatabaseConnectionKeys.DATABASE],
            port: databaseRecord[DatabaseConnectionKeys.PORT],
            username: databaseRecord[DatabaseConnectionKeys.USERNAME],
          },
        }
      : undefined,
  };
};

export const configureDSPipelineResourceSpec = (
  config: PipelineServerConfigType,
  projectName: string,
): Promise<DSPipelineKind['spec']> =>
  createSecrets(config, projectName).then((secretsResponse) =>
    createDSPipelineResourceSpec(config, secretsResponse),
  );

export const objectStorageIsValid = (objectStorage: EnvVariableDataEntry[]): boolean =>
  objectStorage.every(({ key, value }) =>
    PIPELINE_AWS_FIELDS.filter((field) => field.isRequired)
      .map((field) => field.key)
      .includes(key)
      ? !!value.trim()
      : true,
  );

export const getLabelName = (index: string): string => {
  const field = PIPELINE_AWS_FIELDS.find((currentField) => currentField.key === index);
  return field ? field.label : '';
};

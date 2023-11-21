import * as React from 'react';
import * as _ from 'lodash-es';
import { AlertVariant, Button, Stack, StackItem } from '@patternfly/react-core';
import ApplicationsPage from '~/pages/ApplicationsPage';
import { useAppContext } from '~/app/AppContext';
import { fetchClusterSettings, updateClusterSettings } from '~/services/clusterSettingsService';
import {
  ClusterSettingsType,
  ModelServingPlatformEnabled,
  NotebookTolerationFormSettings,
} from '~/types';
import { addNotification } from '~/redux/actions/actions';
import { useCheckJupyterEnabled } from '~/utilities/notebookControllerUtils';
import { useAppDispatch } from '~/redux/hooks';
import PVCSizeSettings from '~/pages/clusterSettings/PVCSizeSettings';
import CullerSettings from '~/pages/clusterSettings/CullerSettings';
import TelemetrySettings from '~/pages/clusterSettings/TelemetrySettings';
import TolerationSettings from '~/pages/clusterSettings/TolerationSettings';
import ModelServingPlatformSettings from '~/pages/clusterSettings/ModelServingPlatformSettings';
import { SupportedArea, useIsAreaAvailable } from '~/concepts/areas';
import {
  DEFAULT_CONFIG,
  DEFAULT_PVC_SIZE,
  DEFAULT_CULLER_TIMEOUT,
  MIN_CULLER_TIMEOUT,
  DEFAULT_TOLERATION_VALUE,
} from './const';

const ClusterSettings: React.FC = () => {
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState<Error>();
  const [clusterSettings, setClusterSettings] = React.useState(DEFAULT_CONFIG);
  const [pvcSize, setPvcSize] = React.useState<number>(DEFAULT_PVC_SIZE);
  const [userTrackingEnabled, setUserTrackingEnabled] = React.useState(false);
  const [cullerTimeout, setCullerTimeout] = React.useState(DEFAULT_CULLER_TIMEOUT);
  const { dashboardConfig } = useAppContext();
  const modelServingEnabled = useIsAreaAvailable(SupportedArea.MODEL_SERVING).status;
  const isJupyterEnabled = useCheckJupyterEnabled();
  const [notebookTolerationSettings, setNotebookTolerationSettings] =
    React.useState<NotebookTolerationFormSettings>({
      enabled: false,
      key: isJupyterEnabled ? DEFAULT_TOLERATION_VALUE : '',
    });
  const [modelServingEnabledPlatforms, setModelServingEnabledPlatforms] =
    React.useState<ModelServingPlatformEnabled>(clusterSettings.modelServingPlatformEnabled);
  const dispatch = useAppDispatch();

  React.useEffect(() => {
    fetchClusterSettings()
      .then((clusterSettings: ClusterSettingsType) => {
        setClusterSettings(clusterSettings);
        setModelServingEnabledPlatforms(clusterSettings.modelServingPlatformEnabled);
        setLoaded(true);
        setLoadError(undefined);
      })
      .catch((e) => {
        setLoadError(e);
      });
  }, []);

  const isSettingsChanged = React.useMemo(
    () =>
      !_.isEqual(clusterSettings, {
        pvcSize,
        cullerTimeout,
        userTrackingEnabled,
        notebookTolerationSettings: {
          enabled: notebookTolerationSettings.enabled,
          key: notebookTolerationSettings.key,
        },
        modelServingPlatformEnabled: modelServingEnabledPlatforms,
      }),
    [
      pvcSize,
      cullerTimeout,
      userTrackingEnabled,
      clusterSettings,
      notebookTolerationSettings,
      modelServingEnabledPlatforms,
    ],
  );

  const handleSaveButtonClicked = () => {
    const newClusterSettings: ClusterSettingsType = {
      pvcSize,
      cullerTimeout,
      userTrackingEnabled,
      notebookTolerationSettings: {
        enabled: notebookTolerationSettings.enabled,
        key: notebookTolerationSettings.key,
      },
      modelServingPlatformEnabled: modelServingEnabledPlatforms,
    };
    if (!_.isEqual(clusterSettings, newClusterSettings)) {
      if (
        Number(newClusterSettings?.pvcSize) !== 0 &&
        Number(newClusterSettings?.cullerTimeout) >= MIN_CULLER_TIMEOUT
      ) {
        setSaving(true);
        updateClusterSettings(newClusterSettings)
          .then((response) => {
            setSaving(false);
            if (response.success) {
              setClusterSettings(newClusterSettings);
              dispatch(
                addNotification({
                  status: AlertVariant.success,
                  title: 'Cluster settings changes saved',
                  message: 'It may take up to 2 minutes for configuration changes to be applied.',
                  timestamp: new Date(),
                }),
              );
            } else {
              throw new Error(response.error);
            }
          })
          .catch((e) => {
            setSaving(false);
            dispatch(
              addNotification({
                status: AlertVariant.danger,
                title: 'Error',
                message: e.message,
                timestamp: new Date(),
              }),
            );
          });
      }
    }
  };

  return (
    <ApplicationsPage
      title="Cluster settings"
      description="Update global settings for all users."
      loaded={loaded}
      empty={false}
      loadError={loadError}
      errorMessage="Unable to load cluster settings."
      emptyMessage="No cluster settings found."
      provideChildrenPadding
    >
      <Stack hasGutter>
        {modelServingEnabled && (
          <StackItem>
            <ModelServingPlatformSettings
              initialValue={clusterSettings.modelServingPlatformEnabled}
              enabledPlatforms={modelServingEnabledPlatforms}
              setEnabledPlatforms={setModelServingEnabledPlatforms}
            />
          </StackItem>
        )}
        <StackItem>
          <PVCSizeSettings
            initialValue={clusterSettings.pvcSize}
            pvcSize={pvcSize}
            setPvcSize={setPvcSize}
          />
        </StackItem>
        <StackItem>
          <CullerSettings
            initialValue={clusterSettings.cullerTimeout}
            cullerTimeout={cullerTimeout}
            setCullerTimeout={setCullerTimeout}
          />
        </StackItem>
        {!dashboardConfig.spec.dashboardConfig.disableTracking && (
          <StackItem>
            <TelemetrySettings
              initialValue={clusterSettings.userTrackingEnabled}
              enabled={userTrackingEnabled}
              setEnabled={setUserTrackingEnabled}
            />
          </StackItem>
        )}
        {isJupyterEnabled && (
          <StackItem>
            <TolerationSettings
              initialValue={clusterSettings.notebookTolerationSettings}
              tolerationSettings={notebookTolerationSettings}
              setTolerationSettings={setNotebookTolerationSettings}
            />
          </StackItem>
        )}
        <StackItem>
          <Button
            data-id="submit-cluster-settings"
            isDisabled={
              saving ||
              !pvcSize ||
              cullerTimeout < MIN_CULLER_TIMEOUT ||
              !isSettingsChanged ||
              !!notebookTolerationSettings.error
            }
            variant="primary"
            isLoading={saving}
            onClick={handleSaveButtonClicked}
          >
            Save changes
          </Button>
        </StackItem>
      </Stack>
    </ApplicationsPage>
  );
};

export default ClusterSettings;

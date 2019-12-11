angular.module('syncthing.core')
    .controller('SettingsController', ['$scope', '$http', function ($scope, $http) {
        $scope.tmpOptions = {};
        $scope.tmpGui = {};

        $scope.discardChangedSettings = function () {
            $("#discard-changes-confirmation").modal("hide");
            $("#settings").modal("hide");
        };

        $scope.closeSettings = function () {
            console.log($scope.tmpOptions);

            if ($scope.settingsModified()) {
                $("#discard-changes-confirmation").modal("show");
            } else {
                $("#settings").modal("hide");
            }
        };

        $scope.initializeTmpSettings = function () {
            // Make a working copy
            $scope.tmpOptions = angular.copy($scope.config.options);
            $scope.tmpOptions.deviceName = $scope.thisDevice().name;
            $scope.tmpOptions.upgrades = "none";

            if ($scope.tmpOptions.autoUpgradeIntervalH > 0) {
                $scope.tmpOptions.upgrades = "stable";
            }

            if ($scope.tmpOptions.upgradeToPreReleases) {
                $scope.tmpOptions.upgrades = "candidate";
            }

            $scope.tmpGUI = angular.copy($scope.config.gui);
            $scope.tmpRemoteIgnoredDevices = angular.copy($scope.config.remoteIgnoredDevices);
            $scope.tmpDevices = angular.copy($scope.config.devices);
            // $('#settings').modal("show");
            // $("#settings a[href='#settings-general']").tab("show");
        };

        $scope.saveConfig = function (cb) {
            var cfg = JSON.stringify($scope.config);
            var opts = {
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            $http.post(urlbase + '/system/config', cfg, opts).success(function () {
                refreshConfig();
                if (cb) {
                    cb();
                }
            }).error(function (data, status, headers, config) {
                refreshConfig();
                $scope.emitHTTPError(data, status, headers, config);
            });
        };

        $scope.urVersions = function () {
            var result = [];

            if ($scope.system) {
                for (var i = $scope.system.urVersionMax; i >= 2; i--) {
                    result.push("" + i);
                }
            }

            return result;
        };

        $scope.settingsModified = function () {
            // Options has artificial properties injected into the temp config.
            // Need to recompute them before we can check equality
            var options = angular.copy($scope.config.options);
            options.deviceName = $scope.thisDevice().name;
            options.upgrades = "none";

            if (options.autoUpgradeIntervalH > 0) {
                options.upgrades = "stable";
            }

            if (options.upgradeToPreReleases) {
                options.upgrades = "candidate";
            }

            var optionsEqual = angular.equals(options, $scope.tmpOptions);
            var guiEquals = angular.equals($scope.config.gui, $scope.tmpGUI);
            var ignoredDevicesEquals = angular.equals($scope.config.remoteIgnoredDevices, $scope.tmpRemoteIgnoredDevices);
            var ignoredFoldersEquals = angular.equals($scope.config.devices, $scope.tmpDevices);
            console.log("settings equals - options: " + optionsEqual + " gui: " + guiEquals + " ignDev: " + ignoredDevicesEquals + " ignFol: " + ignoredFoldersEquals);
            return !optionsEqual || !guiEquals || !ignoredDevicesEquals || !ignoredFoldersEquals;
        };

        $scope.saveSettings = function () {
            // Make sure something changed
            if ($scope.settingsModified()) {
                var themeChanged = $scope.config.gui.theme !== $scope.tmpGUI.theme;
                // Angular has issues with selects with numeric values, so we handle strings here.
                $scope.tmpOptions.urAccepted = parseInt($scope.tmpOptions._urAcceptedStr);
                // Check if auto-upgrade has been enabled or disabled. This
                // also has an effect on usage reporting, so do the check
                // for that later.
                if ($scope.tmpOptions.upgrades == "candidate") {
                    $scope.tmpOptions.autoUpgradeIntervalH = $scope.tmpOptions.autoUpgradeIntervalH || 12;
                    $scope.tmpOptions.upgradeToPreReleases = true;
                    $scope.tmpOptions.urAccepted = $scope.system.urVersionMax;
                    $scope.tmpOptions.urSeen = $scope.system.urVersionMax;
                } else if ($scope.tmpOptions.upgrades == "stable") {
                    $scope.tmpOptions.autoUpgradeIntervalH = $scope.tmpOptions.autoUpgradeIntervalH || 12;
                    $scope.tmpOptions.upgradeToPreReleases = false;
                } else {
                    $scope.tmpOptions.autoUpgradeIntervalH = 0;
                }

                // Check if protocol will need to be changed on restart
                if ($scope.config.gui.useTLS !== $scope.tmpGUI.useTLS) {
                    $scope.protocolChanged = true;
                }

                // Parse strings to arrays before copying over
                ['listenAddresses', 'globalAnnounceServers'].forEach(function (key) {
                    $scope.tmpOptions[key] = $scope.tmpOptions["_" + key + "Str"].split(/[ ,]+/).map(function (x) {
                        return x.trim();
                    });
                });

                // Apply new settings locally
                $scope.thisDeviceIn($scope.tmpDevices).name = $scope.tmpOptions.deviceName;
                $scope.config.options = angular.copy($scope.tmpOptions);
                $scope.config.gui = angular.copy($scope.tmpGUI);
                $scope.config.remoteIgnoredDevices = angular.copy($scope.tmpRemoteIgnoredDevices);
                $scope.config.devices = angular.copy($scope.tmpDevices);
                // $scope.devices is updated by updateLocalConfig based on
                // the config changed event, but settingsModified will look
                // at it before that and conclude that the settings are
                // modified (even though we just saved) unless we update
                // here as well...
                $scope.devices = $scope.config.devices;

                $scope.saveConfig(function () {
                    if (themeChanged) {
                        document.location.reload(true);
                    }
                });
            }

            $('#settings').modal("hide");
        };

        $scope.saveAdvanced = function () {
            $scope.config = $scope.advancedConfig;
            $scope.saveConfig();
            $('#advanced').modal("hide");
        };

        $scope.ignoredFoldersCountTmpConfig = function () {
            var count = 0;
            ($scope.tmpDevices || []).forEach(function (deviceCfg) {
                count += deviceCfg.ignoredFolders.length;
            });
            return count;
        };

        $scope.unignoreDeviceFromTemporaryConfig = function (ignoredDevice) {
            $scope.tmpRemoteIgnoredDevices = $scope.tmpRemoteIgnoredDevices.filter(function (existingIgnoredDevice) {
                return ignoredDevice.deviceID !== existingIgnoredDevice.deviceID;
            });
        };

        $scope.unignoreFolderFromTemporaryConfig = function (device, ignoredFolderID) {
            for (var i = 0; i < $scope.tmpDevices.length; i++) {
                if ($scope.tmpDevices[i].deviceID == device) {
                    $scope.tmpDevices[i].ignoredFolders = $scope.tmpDevices[i].ignoredFolders.filter(function (existingIgnoredFolder) {
                        return existingIgnoredFolder.id !== ignoredFolderID;
                    });
                    return;
                }
            }
        };
    }]);
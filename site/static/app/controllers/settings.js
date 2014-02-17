/*!
 * Identity Settings.
 *
 * Copyright (c) 2012-2014 Digital Bazaar, Inc. All rights reserved.
 *
 * @author Dave Longley
 * @author David I. Lehn
 */
define(['angular', 'bedrock.api'], function(angular, bedrock) {

var deps = ['$scope', 'svcIdentity', '$timeout', 'config'];
return {
  controller: {SettingsCtrl: deps.concat(factory)},
  routes: [{
    path: window.data.identityBasePath + '/:identity/settings',
    options: {
      title: 'Settings',
      templateUrl: '/app/templates/settings.html'
    }
  }]
};

function factory($scope, svcIdentity, $timeout, config) {
  var model = $scope.model = {};
  var data = window.data || {};
  $scope.profile = data.session.profile;
  $scope.identity = svcIdentity.identity;
  $scope.state = {};
  $scope.modals = {};

  $scope.panes = config.settings.panes;

  function refresh(force) {
    var opts = {force: !!force};
  }
  $scope.$on('refreshData', function() {
    refresh(true);
  });
  refresh();
}

});

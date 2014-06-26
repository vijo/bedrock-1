/*!
 * Selector module.
 *
 * Copyright (c) 2012-2014 Digital Bazaar, Inc. All rights reserved.
 *
 * @author Dave Longley
 */
define([
  'angular',
  './selector-modal-directive',
  './selector-directive'
], function(angular, modalSelector, selector) {

'use strict';

var module = angular.module('app.selector', []);

module.directive(modalSelector);
module.directive(selector);

return module.name;

});

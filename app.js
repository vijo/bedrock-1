#!/usr/bin/env node

'use strict';

var path = require('path');
var bedrock = require('./lib/bedrock');

bedrock.start({script: path.join(__dirname, 'index.js')});

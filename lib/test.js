/*
 * Copyright (c) 2012-2015 Digital Bazaar, Inc. All rights reserved.
 */
var config = require('./config');
var events = require('./events');
var execSync = require('child_process').execSync;
var path = require('path');

// module API
var api = {};
module.exports = api;

// add mocha as available test framework
config.test.frameworks.push('mocha');

// default mocha config
config.mocha = {};
config.mocha.options = {
  ignoreLeaks: false,
  reporter: 'spec',
  timeout: 15000,
  useColors: true
};
config.mocha.tests = [];

// built-in tests
config.mocha.tests.push(path.join(__dirname, '..', 'tests'));

events.on('bedrock-cli.init', function(callback) {
  var bedrock = require('./bedrock');

  // add test setup command
  // this will set up a module with a runnable test enviornment
  var setupCommand = bedrock.program
    .command('setup-tests')
    .description('setup test enviornment')
    .action(function() {
      config.cli.command = setupCommand;
      console.log("Action hit", setupCommand.name());
    });

  // add test command
  var testCommand = bedrock.program
    .command('test [option]')
    .description('run tests')
    .option(
      '--framework <frameworks>',
      'A set of comma-delimited test frameworks to run. [all] ' +
      '(' + config.test.frameworks.join(', ') + ')')
    .action(function() {
      config.cli.command = testCommand;
      // load config for testing
      require('./test.config.js');
    });

  // allow special test configs to load
  events.emit('bedrock-cli.test.configure', testCommand, callback);
});

events.on('bedrock-cli.ready', function(callback) {
  var command = config.cli.command;
  if(command.name() === 'setup-tests') {
    console.log("GOT SETUP, HALTING");
    return _runSetupCommand(callback);
  }
  if(command.name() !== 'test') {
    return callback();
  }
  // set reporter
  if(command.mochaReporter) {
    config.mocha.options.reporter = command.mochaReporter;
  }

  events.emit('bedrock.test.configure', callback);
});

events.on('bedrock.started', function() {
  if(config.cli.command.name() === 'tests') {
    return _runTestCommand();
  }
});

function _runTestCommand() {
  var bedrock = require('./bedrock');
  var logger = bedrock.loggers.get('app');
  var state = {pass: true};
  bedrock.runOnce('bedrock.test', function(callback) {
    console.log('Running Test Frameworks...\n');
    logger.info('running test frameworks...');
    bedrock.events.emit('bedrock.tests.run', state, function(err) {
      if(err) {
        console.log('Tests exited with error', err);
        logger.error('tests exited with error', err);
        return callback(err);
      }
      if(!state.pass) {
        console.log('Tests failed.');
        logger.error('tests failed.');
      } else {
        console.log('All tests passed.');
        logger.info('all tests passed.');
      }
      callback();
    });
  }, function(err) {
    if(err) {
      process.exit(err.code || 0);
    }
    if(!state.pass) {
      process.exit(0);
    }
    bedrock.exit();
  });
  return false;
}

function _runSetupCommand(callback) {
  var logger = require('./bedrock').loggers.get('app');
  console.log("RUNNING SETUP COMMAND IN", process.cwd());
  try {
    var package = require(path.join(process.cwd(), 'package.json'));
  } catch(err) {
    if(err.code === 'MODULE_NOT_FOUND') {
      logger.error(
        'A package.json file must be present to set up a testing enviornment');
    }
    logger.error(err);
    process.exit(0);
  }

  // Grab the package.json file and resolve any peer dependencies it may have
  _resolvePeerDependencies(package);
  // Transfer peer dependencies to the package's dependencies

  console.log("RESOLVED", package);

  // Grab the package.json file and write it to ./tests/package.json
  // Halt rest of bedrock core setup.
  return callback(null, false);
}

function _resolvePeerDependencies(package) {
  if(!package.peerDependencies) {
    return;
  }
  for(var peer in package.peerDependencies) {
    _resolvePeer(package, peer, package.peerDependencies[peer]);
  }
}
function _resolvePeer(package, peer, version) {
  // Run an "npm view" on the peer
  console.log("Looking at peer", peer);
  var lookup = peer + '"@' + version + '"';
  // Get all versions matching the lookup,
  // (i.e. all versions matching "bedrock@^1.0.0")
  var versions = execSync('npm info ' + lookup + ' version').toString('utf8');
  // Grab the last version found
  // "npm info lookup version" will return a buffer this:
  // bedrock-idp@1.0.0 '1.0.0'
  // bedrock-idp@1.0.1 '1.0.1'
  // bedrock-idp@1.0.2 '1.0.2'
  // bedrock-idp@1.0.3 '1.0.3'
  //
  if(versions.trim().lastIndexOf('\n') === -1) {
    // Got one result back, will return a string of just the version
    console.log("ONE RESULT BACK", versions);
    var latestVersion = peer + '@' + versions.trim();
  } else {
    // Got multiple back
    var latestVersion = versions
      .substring(versions.trim().lastIndexOf('\n'))
      .split(' ')[0]
      .trim();
  }

  console.log("Running npm info " + latestVersion);
  var peerPackage =
    JSON.parse(execSync('npm info ' + latestVersion + ' --json').toString('utf8'));

  // Add resolved peer dependencies into the original
  // package's peer dependency list
  for(peer in peerPackage.peerDependencies) {
    version = peerPackage.peerDependencies[peer];
    if(peer in package.peerDependencies) {
      // Peer is already in peerDependency list, overwrite, and
      // do not continue resolving it
      // TODO: Compare semver versions and throw error if conflict
      console.log('Peer ' + peer + ' already in package.json, overwriting');
      package.peerDependencies[peer] = version;
      continue;
    }
    package.peerDependencies[peer] = version;
    _resolvePeer(package, peer, version);
  }
}

events.on('bedrock-cli.test.configure', function(command) {
  command
    .option(
      '--mocha-test <files>',
      'A set of comma-delimited mocha test files to run.')
    .option('--mocha-reporter <reporter>',
      'Mocha test reporter [spec]', 'spec');
});

events.on('bedrock.tests.run', function(state, callback) {
  if(api.shouldRunFramework('mocha')) {
    return runMocha(state, callback);
  }
  callback();
});

/**
 * Check if a test framework is runnable.
 *
 * @param test the global test state.
 */
api.shouldRunFramework = function(framework) {
  var frameworks = config.cli.command.framework;
  // default to run, else check for name in frameworks list
  return !frameworks || frameworks.split(/[ ,]+/).indexOf(framework) !== -1;
};

/**
 * Run Mocha-based tests.
 *
 * @param test the global test state.
 */
function runMocha(state, callback) {
  var bedrock = require('./bedrock');
  var Mocha = require('mocha');
  var chai = require('chai');
  var chaiAsPromised = require('chai-as-promised');
  var fs = require('fs');

  var logger = bedrock.loggers.get('app');

  // setup chai / chai-as-promised
  chai.use(chaiAsPromised);

  // set globals for tests to use
  global.chai = chai;
  global.should = chai.should();

  var mocha = new Mocha(config.mocha.options);

  // add test files
  if(config.cli.command.mochaTest) {
    config.cli.command.mochaTest.split(',').forEach(function(path) {
      _add(path);
    });
  } else {
    config.mocha.tests.forEach(function(path) {
      _add(path);
    });
  }

  // console.log w/o eol
  process.stdout.write('Running Mocha tests...');

  state.mocha = {};
  mocha.run(function(failures) {
    if(failures) {
      state.mocha.failures = failures;
      state.pass = false;
    }
    callback();
  });

  // add a file or directory
  function _add(_path) {
    if(fs.existsSync(_path)) {
      var stats = fs.statSync(_path);
      if(stats.isDirectory()) {
        fs.readdirSync(_path).sort().forEach(function(file) {
          if(path.extname(file) === '.js') {
            file = path.join(_path, file);
            logger.debug('adding test file', file);
            mocha.addFile(file);
          }
        });
      } else if(path.extname(_path) === '.js') {
        logger.debug('adding test file', _path);
        mocha.addFile(_path);
      }
    }
  }
}

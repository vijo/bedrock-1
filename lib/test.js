/*
 * Copyright (c) 2012-2015 Digital Bazaar, Inc. All rights reserved.
 */
var config = require('./config');
var events = require('./events');
var execSync = require('child_process').execSync;
var fs = require('fs');
var path = require('path');
var install = require('./install');

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
  var bedrock = require('./bedrock');
  var logger = bedrock.loggers.get('app');
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
  install.resolvePeerDependencies(package);
  // Transfer peer dependencies to the package's dependencies
  for(var peer in package.peerDependencies) {
    var version = package.peerDependencies[peer];
    if(peer in package.dependencies) {
      // Package already in dependency list
      // TODO: Check semver versions and see if conflict
      //console.log("Peer " + peer + " already in package's dependency list");
    }
    package.dependencies[peer] = version;
  }
  delete package.peerDependencies
  // Grab the resolved object and write it as json to ./tests/package.json
  var testDir = path.join(process.cwd(), 'test');
  try {
    fs.mkdirSync(testDir);
  } catch(err) {
    if(err.code !== 'EEXIST') {
      throw err;
    }
  }

  var packageDir = path.join(testDir, 'package.json');
  logger.info('Writing to ' + packageDir);
  fs.writeFileSync(packageDir, JSON.stringify(package, null, 2));

  // Write bower.json to testDir as well
  try {
    var bower = require(path.join(process.cwd(), 'bower.json'));
    var bowerDir = path.join(testDir, 'bower.json');
    logger.info('Copying bower.json file to ' + bowerDir);
    fs.writeFileSync(bowerDir, JSON.stringify(bower, null, 2));

  } catch(err) {
    if(err.code === 'MODULE_NOT_FOUND') {
      logger.info(
        'No bower.json file found');
    } else if(err.code !== 'EEXIST') {
      throw err
    }
  }

  // Run an npm-install in the test directory
  execSync('npm install', {cwd: testDir, stdio: [0, 1, 2]});

  var moduleName = path.basename(process.cwd());
  var symlinkDir = path.join(testDir, 'node_modules', moduleName);
  // Symlink the current directory inside the newly created node_modules directory
  logger.info('Symlinking ' + symlinkDir + ' => ' + process.cwd());
  try {
    fs.symlinkSync(process.cwd(), symlinkDir);
  } catch(err) {
    if(err.code !== 'EEXIST') {
      throw err;
    }
  }

  // Create an example test.js if it does not already exist
  try {
    fs.writeFileSync(path.join(testDir, 'test.js'),
      "var bedrock = require('bedrock');\n" +
      "require('" + moduleName + "');\n" +
      "\n" +
      "bedrock.start();\n",
      {flag: 'wx'});
    logger.info('Writing to ' + path.join(testDir, 'test.js'));
  } catch(err) {
    if(err.code !== 'EEXIST') {
      throw err;
    }
  }

  // Halt rest of bedrock core setup.
  bedrock.exit();
  return callback(null, false);
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

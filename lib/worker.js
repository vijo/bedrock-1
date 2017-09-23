/*
 * Copyright (c) 2012-2015 Digital Bazaar, Inc. All rights reserved.
 */
// wait for initialization options from master
const fs = require('fs');

process.on('message', init);

// notify master to send initialization options
process.send({type: 'bedrock.worker.started'});

function init(msg) {
  console.log('TTTTTTTTTTTTTTTTTTTTTTTT');
  if(!(typeof msg === 'object' && msg.type === 'bedrock.worker.init')) {
    return;
  }
  process.removeListener('message', init);

  // ensure current working directory is correct
  if(msg.cwd && process.cwd() !== msg.cwd) {
    process.chdir(msg.cwd);
  }
  console.log('UUUUUUUUU', msg.script);
  fs.readFileSync(msg.script, 'utf8', (err, data) => {
    console.log('VVVVVVVVVVVVVVV', err);
    console.log('WWWWWWWWWWWWWWW', data);
  });
  require(msg.script);
}

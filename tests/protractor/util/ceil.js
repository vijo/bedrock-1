var helper = require('../helper');

describe('ceil', function() {
  beforeEach(function() {
    helper.get('/');
  });

  it('should convert 1.123 to 1.13', function() {
    expect(helper.run(function($injector) {
      var filter = $injector.get('ceilFilter');
      return filter(1.123, 2);
    })).toEqual('1.13');
  });

  it('should convert 0.991 to 1.00', function() {
    expect(helper.run(function($injector) {
      var filter = $injector.get('ceilFilter');
      return filter(0.991, 2);
    })).toEqual('1.00');
  });

  it('should convert 0.991 to 0.9910', function() {
    expect(helper.run(function($injector) {
      var filter = $injector.get('ceilFilter');
      return filter('0.991', 4);
    })).toEqual('0.9910');
  });
});
